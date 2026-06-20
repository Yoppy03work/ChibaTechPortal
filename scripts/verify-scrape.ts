/**
 * scraper live 検証ツール（#3）— お知らせ取込 / 課題取込が実際に動くかを安全に確認する
 *
 * WHY: SCRAPE_ENABLED=true + 実 creds がある状態で、scrape-job.ts と同じアダプタ経路
 * (login → fetchNotifications → fetchAssignments) が「実 CIT Portal / manaba に対して」
 * 本当に動くかを、DB を汚さずに確認するための単発スクリプト。
 *
 * 設計方針:
 *  - 既定は dry-run。fetch だけして DB 書き込みは一切しない（件数とサンプルだけ表示）。
 *  - DB へ書く（diffAndSave / diffAndSaveAssignments を通す）のは明示的に --write を付けた時だけ。
 *  - BullMQ / Redis は経由しない。アダプタを直接 new して呼ぶので、Redis 不要・ジョブ投入なし。
 *  - 認証情報は env から受け取り、引数には載せない（ターミナル履歴 / プロセス引数への漏洩回避）。
 *  - creds は使用後に best-effort で参照を捨てる。エラーメッセージに creds を載せない。
 *
 * 安全ゲート:
 *  - SCRAPE_ENABLED=true を必須にする（既定オフ思想を踏襲）。未設定/false なら何もせず終了。
 *  - 外部アクセス前に healthCheck を通す（システム停止中なら skip）。
 *  - --write は SCRAPE_ENABLED=true かつ ALLOW_DB_WRITE=true の両方が無いと拒否する（二重ガード）。
 *
 * 使い方（dry-run / DB 非書き込み / Redis 不要）:
 *   SCRAPE_ENABLED=true \
 *   VERIFY_TARGET=manaba \
 *   VERIFY_USER_ID='<学籍ID>' VERIFY_PASSWORD='<パスワード>' \
 *     npx tsx scripts/verify-scrape.ts
 *
 *   # CIT Portal を検証する場合:
 *   SCRAPE_ENABLED=true VERIFY_TARGET=cit-portal \
 *   VERIFY_USER_ID='<学籍ID>' VERIFY_PASSWORD='<パスワード>' \
 *     npx tsx scripts/verify-scrape.ts
 *
 *   # 両方まとめて (notifications→assignments の順):
 *   SCRAPE_ENABLED=true VERIFY_TARGET=both \
 *   VERIFY_USER_ID='<学籍ID>' VERIFY_PASSWORD='<パスワード>' \
 *     npx tsx scripts/verify-scrape.ts
 *
 * DB に実際に保存して差分エンジンまで確認したい場合（任意・既定では使わない）:
 *   SCRAPE_ENABLED=true ALLOW_DB_WRITE=true \
 *   DATABASE_URL='postgresql://...' \
 *   VERIFY_TARGET=manaba VERIFY_DB_USER_ID='<DB上のUser.id>' \
 *   VERIFY_USER_ID='<学籍ID>' VERIFY_PASSWORD='<パスワード>' \
 *     npx tsx scripts/verify-scrape.ts --write
 *
 * 注意: ルール上、外部システム（CIT Portal/manaba/出席）に「黙認ラインを越えて」アクセス
 * しないこと。このスクリプトは自分自身の creds での 1 回限りの read-only fetch を前提に設計する。
 */
import { createAdapter } from '../apps/worker/src/scrapers/adapter-factory';
import type {
  ScraperSession,
  ScrapedNotificationItem,
  ScrapedAssignment,
} from '@chibatech/shared';

type Target = 'cit-portal' | 'manaba';

const WRITE = process.argv.includes('--write');

function fail(msg: string): never {
  console.error(`\n=== verify-scrape FAILED ===\n${msg}`);
  process.exit(1);
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) fail(`環境変数 ${name} が未設定です。`);
  return v;
}

function resolveTargets(): Target[] {
  const t = (process.env.VERIFY_TARGET ?? 'manaba').toLowerCase();
  if (t === 'both') return ['manaba', 'cit-portal'];
  if (t === 'manaba' || t === 'cit-portal') return [t];
  fail(`VERIFY_TARGET は manaba | cit-portal | both のいずれか（実際: '${t}'）`);
}

function preview(s: string, n = 60): string {
  const oneLine = s.replace(/\s+/g, ' ').trim();
  return oneLine.length > n ? `${oneLine.slice(0, n)}…` : oneLine;
}

/** dry-run: fetch した件数とサンプルを表示するだけ（DB 非書き込み） */
function reportNotifications(target: Target, items: ScrapedNotificationItem[]): void {
  console.log(`[${target}] お知らせ取込: fetched=${items.length} 件 (DB 書き込みなし / dry-run)`);
  items.slice(0, 3).forEach((n, i) => {
    console.log(
      `   #${i + 1} title="${preview(n.title)}" extId="${preview(n.externalId, 40)}" ` +
        `publishedAt=${n.publishedAt instanceof Date ? n.publishedAt.toISOString() : String(n.publishedAt)}`
    );
  });
  if (items.length === 0) {
    console.warn(
      `   ! 0 件。ログイン未確立 / HTML 構造変更 / 該当データなし のいずれかの可能性。` +
        ` セレクタ（scrape-job 経由の adapter）を実 HTML で要確認。`
    );
  }
}

function reportAssignments(target: Target, items: ScrapedAssignment[]): void {
  console.log(`[${target}] 課題取込: fetched=${items.length} 件 (DB 書き込みなし / dry-run)`);
  items.slice(0, 3).forEach((a, i) => {
    console.log(
      `   #${i + 1} title="${preview(a.title)}" course="${preview(a.courseName, 30)}" ` +
        `due=${a.dueDate ? a.dueDate.toISOString() : 'null'}`
    );
  });
}

async function verifyTarget(target: Target): Promise<void> {
  console.log(`\n===== ${target} =====`);
  const adapter = createAdapter(target);

  // WHY: scrape-job.ts と同じく、外部アクセス前に healthCheck で稼働確認する。
  const healthy = await adapter.healthCheck();
  console.log(`[${target}] healthCheck=${healthy}`);
  if (!healthy) {
    console.warn(`[${target}] システム停止中（または到達不可）。skip。`);
    return;
  }

  // creds は env から。引数には載せない。
  let userId: string | undefined = requireEnv('VERIFY_USER_ID');
  let password: string | undefined = requireEnv('VERIFY_PASSWORD');

  let session: ScraperSession;
  try {
    session = await adapter.login(userId, password);
    console.log(
      `[${target}] login OK (cookies=${Object.keys(session.cookies).length} 個, ` +
        `expiresAt=${new Date(session.expiresAt).toISOString()})`
    );
  } finally {
    // WHY: creds がメモリに残る期間を最小化（best-effort）。
    userId = undefined;
    password = undefined;
  }

  // 1) まず notifications（scrape-job の実行順と同じ）
  const notifications = await adapter.fetchNotifications(session);
  reportNotifications(target, notifications);

  // 2) 次に assignments（manaba のみ。CIT Portal は fetchAssignments を持たない）
  let assignments: ScrapedAssignment[] = [];
  if (adapter.fetchAssignments) {
    assignments = await adapter.fetchAssignments(session);
    reportAssignments(target, assignments);
  } else {
    console.log(`[${target}] 課題取込: このアダプタは fetchAssignments 非対応（skip）`);
  }

  // 3) （任意）--write 指定時のみ、差分エンジンを通して実 DB に保存する。
  if (WRITE) {
    const dbUserId = requireEnv('VERIFY_DB_USER_ID'); // DB 上の User.id（学籍IDとは別物）
    const { diffAndSave, diffAndSaveAssignments } = await import(
      '../apps/worker/src/services/diff-engine'
    );
    const newN = await diffAndSave(dbUserId, target, notifications);
    console.log(`[${target}] [WRITE] notifications 新着保存=${newN.length} 件 (user=${dbUserId})`);
    if (adapter.fetchAssignments) {
      const newA = await diffAndSaveAssignments(dbUserId, assignments);
      console.log(`[${target}] [WRITE] assignments 新着保存=${newA.length} 件 (user=${dbUserId})`);
    }
  }
}

async function main(): Promise<void> {
  // 安全ゲート 1: SCRAPE_ENABLED=true を必須化（scrape-job / scheduler と同思想の dark default）。
  if (process.env.SCRAPE_ENABLED !== 'true') {
    fail(
      'SCRAPE_ENABLED=true が必要です（外部アクセスを伴うため既定オフ）。' +
        '\n  例: SCRAPE_ENABLED=true VERIFY_TARGET=manaba VERIFY_USER_ID=... VERIFY_PASSWORD=... npx tsx scripts/verify-scrape.ts'
    );
  }

  // 安全ゲート 2: --write は ALLOW_DB_WRITE=true も無いと拒否（DB を汚さない既定）。
  if (WRITE && process.env.ALLOW_DB_WRITE !== 'true') {
    fail('--write 指定時は ALLOW_DB_WRITE=true も必要です（DB 書き込みの二重ガード）。');
  }

  console.log('=== scraper live 検証 (verify-scrape) ===');
  console.log(`mode=${WRITE ? 'WRITE (DB 保存あり)' : 'DRY-RUN (DB 書き込みなし)'}`);
  console.log(`実行時刻: ${new Date().toISOString()}`);

  const targets = resolveTargets();
  for (const t of targets) {
    await verifyTarget(t);
  }

  console.log('\n=== verify-scrape 完了 ===');
}

main()
  .then(async () => {
    if (WRITE) {
      // WHY: --write 時のみ Prisma 接続を張るので、その時だけ閉じる。
      const { prisma } = await import('@chibatech/db');
      await prisma.$disconnect();
    }
  })
  .catch((e: unknown) => {
    // WHY: creds を載せないよう message だけ出す。
    const msg = e instanceof Error ? e.message : String(e);
    fail(msg);
  });
