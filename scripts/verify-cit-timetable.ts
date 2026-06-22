/**
 * CIT Portal 時間割 live 検証ツール (#1 fetchTimetable live 検証)
 *
 * WHY: cit-portal-http.ts の login → fetchTimetable → parseTimetableHtml が、
 * 実 CIT Portal (UNIPA/UPRX) に対して「直接 GET だけで時間割テーブルを描画できるか」を
 * 1 コマンドで判定する。直接 GET で 0 コマ/未描画なら「JSF ナビ (期選択 POST 等) の追加が必要」と
 * 結論づけ、終了コードで CI/人間に伝える。
 *
 * 重要 (副作用ゼロの保証):
 *   - 本スクリプトが行う書き込み系操作は adapter.login() の「ログイン POST」のみ。
 *     これは認証に必須でありデータを変更しない (出席送信・履修変更などは一切しない)。
 *   - 時間割の取得は TIMETABLE_URL への GET のみ。HTML 検査用の raw GET も GET のみ。
 *   - ファイルは書き込まない。DB にもアクセスしない。
 *   - CIT_Wi-Fi + 実 creds がある環境でのみ意味を持つ (外部アクセスを伴う)。
 *
 * 使い方 (1 コマンド):
 *   CIT_PORTAL_USER_ID='B0000000' CIT_PORTAL_PASSWORD='****' \
 *     npx tsx scripts/verify-cit-timetable.ts
 *
 * 任意 env:
 *   CIT_PORTAL_BASE_URL  別キャンパス/stub の URL 上書き (既定: 本番 UPRX)
 *   VERIFY_DUMP_HTML=1   未描画判定時に取得 HTML の先頭を標準出力にダンプ (デバッグ用)
 *
 * 終了コード:
 *   0  ログイン成功 かつ 時間割テーブル検出 かつ 抽出コマ数 >= 1 (= 直接 GET で描画 OK)
 *   2  ログイン成功 かつ (テーブル無し or 0 コマ) = 未描画 → JSF ナビ追加が必要
 *   3  ログイン失敗 (creds 不正 / ViewState 取得失敗 / ネットワーク / env 不足)
 *   1  想定外エラー
 */
import { CitPortalHttpAdapter } from '../apps/worker/src/scrapers/adapters/cit-portal-http';
import { parseTimetableHtml } from '../apps/worker/src/scrapers/timetable-parser';
import type { ScraperSession } from '@chibatech/shared';

// 実機検証(2026-06)で正しいホストは portal.chibatech.ac.jp と判明。
// 注意: 在学生は Shibboleth SSO 経由のため、この直接フォーム検証は creds が
// ゲスト/学外向けのときのみ成功する (在学生 creds は弾かれる)。
const BASE_URL =
  process.env.CIT_PORTAL_BASE_URL ?? 'https://portal.chibatech.ac.jp/uprx';
const TIMETABLE_URL = `${BASE_URL}/up/km/kmd008/Kmd00801.xhtml`;
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

// 終了コードの意味を名前で扱う
const EXIT = { OK: 0, UNEXPECTED: 1, NOT_RENDERED: 2, LOGIN_FAILED: 3 } as const;

function cookiesToHeader(cookies: Record<string, string>): string {
  return Object.entries(cookies)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
}

/**
 * fetchTimetable と同一の GET を再現し、解析前の raw HTML を返す。
 * WHY: adapter.fetchTimetable() は parse 済み entry しか返さないため、
 * 「テーブルが HTML に存在するか」を別途検査する必要がある。副作用なしの GET のみ。
 */
async function fetchTimetableHtml(
  session: ScraperSession
): Promise<{ status: number; html: string }> {
  const resp = await fetch(TIMETABLE_URL, {
    headers: {
      'User-Agent': USER_AGENT,
      Cookie: cookiesToHeader(session.cookies),
    },
    signal: AbortSignal.timeout(15000),
  });
  const html = await resp.text();
  return { status: resp.status, html };
}

function log(line = '') {
  // eslint-disable-next-line no-console
  console.log(line);
}

async function main(): Promise<number> {
  const userId = process.env.CIT_PORTAL_USER_ID;
  const password = process.env.CIT_PORTAL_PASSWORD;

  log('=== CIT Portal 時間割 live 検証 (#1 fetchTimetable) ===');
  log(`実行日時: ${new Date().toLocaleString('ja-JP')}`);
  log(`BASE_URL: ${BASE_URL}`);
  log(`TIMETABLE_URL: ${TIMETABLE_URL}`);
  log('');

  if (!userId || !password) {
    log('[NG] env が不足しています。');
    log('  必要: CIT_PORTAL_USER_ID, CIT_PORTAL_PASSWORD');
    log('  例: CIT_PORTAL_USER_ID=B0000000 CIT_PORTAL_PASSWORD=**** npx tsx scripts/verify-cit-timetable.ts');
    return EXIT.LOGIN_FAILED;
  }

  const adapter = new CitPortalHttpAdapter();

  // --- (a) ログイン成否 ---
  log('--- (a) ログイン ---');
  let session: ScraperSession;
  try {
    session = await adapter.login(userId, password);
  } catch (e) {
    log(`[NG] ログイン失敗: ${(e as Error)?.message ?? String(e)}`);
    log('  → creds / ViewState / ネットワーク (CIT_Wi-Fi?) を確認してください。');
    return EXIT.LOGIN_FAILED;
  }
  const cookieNames = Object.keys(session.cookies);
  log(`[OK] ログイン成功 (cookies: ${cookieNames.length} 個: ${cookieNames.join(', ') || '(なし)'})`);
  log(`     session expiresAt: ${new Date(session.expiresAt).toLocaleString('ja-JP')}`);
  if (cookieNames.length === 0) {
    log('  ! セッション cookie が 0 個です。login が成功扱いでも実際は未認証の可能性があります。');
  }
  log('');

  // --- (b) 取得 HTML が時間割テーブルを含むか (raw GET を検査) ---
  log('--- (b) 時間割ページ取得 + テーブル検査 (GET のみ・副作用なし) ---');
  const { status, html } = await fetchTimetableHtml(session);
  log(`GET ${TIMETABLE_URL} → HTTP ${status}, body ${html.length} bytes`);

  const title = html.match(/<title>([\s\S]*?)<\/title>/)?.[1]?.trim() ?? '(なし)';
  log(`page <title>: ${title}`);

  const hasClassTable = /class=["'][^"']*\bclassTable\b/.test(html);
  // ログインページに差し戻されていないか (セッション切れ/未認証の典型)
  const looksLikeLoginPage =
    html.includes('loginForm') || html.includes('Pky00101') || /ログイン/.test(title);

  log(`table.classTable 検出: ${hasClassTable ? 'YES' : 'NO'}`);
  if (looksLikeLoginPage) {
    log('  ! ログインページに見えます (loginForm / Pky00101 / title にログイン)。');
    log('    → セッションが時間割ページまで通っていない可能性。');
  }
  log('');

  // --- (c) 抽出コマ数 (本番コードパス adapter.fetchTimetable + 参考 parseTimetableHtml) ---
  log('--- (c) コマ抽出 ---');
  // 本番が実際に呼ぶ経路 (login→fetchTimetable→parseTimetableHtml) をそのまま実行
  const entriesViaAdapter = await adapter.fetchTimetable!(session);
  // 検査した raw HTML を直接 parse した結果 (両者は一致するはず。差分があれば調査の手がかり)
  const entriesViaRawHtml = parseTimetableHtml(html);
  log(`adapter.fetchTimetable(): ${entriesViaAdapter.length} コマ`);
  log(`parseTimetableHtml(raw):  ${entriesViaRawHtml.length} コマ (参考)`);

  const sample = entriesViaAdapter.slice(0, 5);
  for (const e of sample) {
    log(
      `  - day=${e.dayOfWeek} period=${e.period} "${e.className}" room=${e.room ?? '(なし)'}`
    );
  }
  if (entriesViaAdapter.length > sample.length) {
    log(`  ... 他 ${entriesViaAdapter.length - sample.length} コマ`);
  }
  log('');

  // --- 判定 ---
  log('=== 判定 ===');
  const count = entriesViaAdapter.length;
  if (hasClassTable && count >= 1) {
    log(`[PASS] 直接 GET で時間割が描画されています (${count} コマ抽出)。JSF ナビ追加は不要。`);
    return EXIT.OK;
  }

  // ここに来た = テーブル無し or 0 コマ → 未描画
  log('[FAIL] 直接 GET では時間割が描画されていません。');
  if (!hasClassTable) {
    log('  理由: HTML に table.classTable が存在しない。');
  } else {
    log('  理由: table.classTable はあるがコマが 0 (空テーブル/期未選択の可能性)。');
  }
  log('  → 結論: fetchTimetable に JSF ナビゲーション (ViewState を引き継いだ');
  log('     期/年度選択の POST、または時間割タブへの遷移 POST) の追加が必要。');
  if (looksLikeLoginPage) {
    log('  → 加えて: ログインページに差し戻されているため、まず認証セッションの確立を疑うこと。');
  }
  if (process.env.VERIFY_DUMP_HTML === '1') {
    log('');
    log('--- 取得 HTML 先頭 4000 字 (VERIFY_DUMP_HTML=1) ---');
    log(html.slice(0, 4000));
  } else {
    log('  (HTML をダンプして調査するには VERIFY_DUMP_HTML=1 を付けて再実行)');
  }
  return EXIT.NOT_RENDERED;
}

main()
  .then((code) => process.exit(code))
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error('\n=== UNEXPECTED ERROR ===\n', e);
    process.exit(EXIT.UNEXPECTED);
  });
