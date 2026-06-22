/**
 * #1 (SSO 版) CIT ポータル時間割の live 検証ツール。
 *
 * 在学生は統合認証 (Keycloak + MFA/TOTP) 経由でしかログインできないため、移植した
 * SSO ログイン (apps/worker/src/scrapers/cit-portal) で認証済み時間割 HTML を取得し、
 * ChibaTechPortal の検証済みパーサ (timetable-parser.ts) で ScrapedTimetableEntry に
 * 落とすところまでを本番同一経路で 1 コマンド確認する。
 *
 * 必要 env (creds は .tmp/cit.env 等に置いてソース実行。値は出力しない):
 *   - CIT_PORTAL_USER_ID      学籍 ID (統合認証 username)
 *   - CIT_PORTAL_PASSWORD     統合認証パスワード
 *   - CIT_PORTAL_TOTP_SECRET  認証アプリの BASE32 シークレット (MFA 必須)
 *   - CIT_PORTAL_TOTP_DEVICE  (任意) 複数 TOTP デバイス時に選ぶデバイス名の部分一致
 *   - CIT_PORTAL_BASE_URL     (任意) 既定 https://portal.chibatech.ac.jp
 *   - CIT_PORTAL_DEBUG=1       (任意) 各段の HTML サイズ/検出フォームをログ (秘密は redact 済)
 *
 * 副作用: 統合認証へのログイン (読み取りのみ。出席送信・履修変更・DB 書込なし)。
 * 失敗時は終了コードで示す: 2=env不足, 3=ログイン/取得失敗。
 */
import {
  fetchCitPortalTimetableHtml,
  CitPortalError,
} from '../apps/worker/src/scrapers/cit-portal/cit-portal-scraper';
import { parseTimetableHtml } from '../apps/worker/src/scrapers/timetable-parser';

async function main() {
  const userId = process.env.CIT_PORTAL_USER_ID;
  const password = process.env.CIT_PORTAL_PASSWORD;
  const totpSecret = process.env.CIT_PORTAL_TOTP_SECRET;
  const deviceName = process.env.CIT_PORTAL_TOTP_DEVICE || null;

  console.log('=== CIT ポータル SSO 時間割 live 検証 (#1 / 統合認証) ===');
  console.log('BASE_URL:', process.env.CIT_PORTAL_BASE_URL ?? 'https://portal.chibatech.ac.jp');
  if (!userId || !password || !totpSecret) {
    console.error(
      '[NG] env 不足: CIT_PORTAL_USER_ID / CIT_PORTAL_PASSWORD / CIT_PORTAL_TOTP_SECRET が必要です。'
    );
    process.exit(2);
  }

  try {
    const html = await fetchCitPortalTimetableHtml(userId, password, totpSecret, deviceName);
    const entries = parseTimetableHtml(html);
    if (entries.length === 0) {
      console.error('[NG] ログインは通ったが classTable から 0 コマ。menuForm nav か parser を要確認。');
      process.exit(3);
    }
    const rooms = [...new Set(entries.map((e) => e.room).filter(Boolean))];
    console.log('[OK] ログイン + 時間割取得 + パース 成功');
    console.log('  ScrapedTimetableEntry 数:', entries.length);
    console.log('  room ユニーク:', rooms.join(' | '));
    console.log('  dayOfWeek 範囲:',
      Math.min(...entries.map((e) => e.dayOfWeek)), '-', Math.max(...entries.map((e) => e.dayOfWeek)));
    console.log('  先頭3:', JSON.stringify(entries.slice(0, 3)));
    process.exit(0);
  } catch (e) {
    if (e instanceof CitPortalError) {
      console.error(`[NG] ${e.stage} 段で失敗: ${e.message}`);
    } else {
      console.error('[NG] 失敗:', e instanceof Error ? e.message : e);
    }
    process.exit(3);
  }
}
main();
