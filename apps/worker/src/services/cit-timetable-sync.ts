/**
 * CIT ポータルの時間割を SSO(統合認証+MFA) で取得し DB に同期する。
 *
 * フロー: fetchCitPortalTimetableHtml(env creds) → parseTimetableHtml(header ベース)
 *        → syncTimetable(syncUserId, entries) (manual 行は保護、scraped を upsert)。
 *
 * セキュリティ: creds/TOTP secret は DB ではなく env から読む ([[cit-portal-env]])。
 * ゲート: isCitTimetableSyncEnabled() (SCRAPE_ENABLED + CIT_TIMETABLE_SYNC_ENABLED + creds)。
 * 無効・creds 欠如時は外部アクセスせず skip する (fail-closed)。
 */
import type { ScrapedTimetableEntry } from '@chibatech/shared';
import { fetchCitPortalTimetableHtml } from '../scrapers/cit-portal/cit-portal-scraper';
import { parseTimetableHtml } from '../scrapers/timetable-parser';
import { syncTimetable } from './timetable-sync';
import { getCitPortalSyncConfig, isCitTimetableSyncEnabled } from '../lib/cit-portal-env';

/** テスト用に外部 I/O を差し替えられるようにする (既定は本番実装)。 */
export interface CitTimetableSyncDeps {
  fetchHtml?: (
    userId: string,
    password: string,
    totpSecret: string,
    totpDeviceName: string | null
  ) => Promise<string>;
  parse?: (html: string) => ScrapedTimetableEntry[];
  sync?: (userId: string, entries: ScrapedTimetableEntry[]) => Promise<unknown>;
}

export type CitTimetableSyncResult =
  | { ran: true; synced: number }
  | { ran: false; reason: 'disabled' | 'empty' };

/**
 * CIT 時間割を 1 回同期する。無効なら外部アクセスせず {ran:false,reason:'disabled'}。
 * 取得 0 コマなら DB を触らず {ran:false,reason:'empty'} (誤って全行消さない安全策)。
 */
export async function runCitTimetableSync(
  deps: CitTimetableSyncDeps = {}
): Promise<CitTimetableSyncResult> {
  if (!isCitTimetableSyncEnabled()) {
    return { ran: false, reason: 'disabled' };
  }
  const cfg = getCitPortalSyncConfig();
  if (!cfg) return { ran: false, reason: 'disabled' };

  const fetchHtml = deps.fetchHtml ?? fetchCitPortalTimetableHtml;
  const parse = deps.parse ?? parseTimetableHtml;
  const sync = deps.sync ?? syncTimetable;

  const html = await fetchHtml(
    cfg.userId,
    cfg.password,
    cfg.totpSecret,
    cfg.totpDeviceName
  );
  const entries = parse(html);
  if (entries.length === 0) {
    // WHY: 0 コマで syncTimetable を呼ぶと scraped 行が全削除される恐れ。取得失敗/
    // ナビ不全の可能性が高いので DB を触らず skip する。
    console.warn('[cit-timetable-sync] 抽出 0 コマ。DB 同期を skip。');
    return { ran: false, reason: 'empty' };
  }
  await sync(cfg.syncUserId, entries);
  console.log(
    `[cit-timetable-sync] user=${cfg.syncUserId} に ${entries.length} コマを同期`
  );
  return { ran: true, synced: entries.length };
}
