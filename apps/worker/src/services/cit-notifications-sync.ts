/**
 * CIT 掲示板(お知らせ)を SSO で取得し DB に差分保存 + 新着を通知する。
 *
 * フロー: fetchCitPortalNotificationsHtml(env creds, SSO+掲示板 nav) →
 *        parseCitPortalNotifications(tabArea 一覧, dedupe) → diffAndSave(新着のみ INSERT) →
 *        新着があれば notifyQueue へ enqueue。
 *
 * セキュリティ/ゲート: #1 と同じく secret は env から ([[cit-portal-env]])。
 * isCitNotificationsSyncEnabled() (SCRAPE_ENABLED + CIT_NOTIFICATIONS_SYNC_ENABLED + creds)。
 * diffAndSave は新着 INSERT のみで削除しないため 0 件でも安全。
 */
import type { ScrapedNotificationItem } from '@chibatech/shared';
import { fetchCitPortalNotificationsHtml } from '../scrapers/cit-portal/cit-portal-scraper';
import { parseCitPortalNotifications } from '../scrapers/cit-portal/notifications-parser';
import { diffAndSave } from './diff-engine';
import {
  getCitPortalSyncConfig,
  isCitNotificationsSyncEnabled,
} from '../lib/cit-portal-env';

export interface CitNotificationsSyncDeps {
  fetchHtml?: (
    userId: string,
    password: string,
    totpSecret: string,
    totpDeviceName: string | null
  ) => Promise<string>;
  parse?: (html: string) => ScrapedNotificationItem[];
  save?: (
    userId: string,
    items: ScrapedNotificationItem[]
  ) => Promise<ScrapedNotificationItem[]>;
  notify?: (userId: string, items: ScrapedNotificationItem[]) => Promise<void>;
}

export type CitNotificationsSyncResult =
  | { ran: true; total: number; new: number }
  | { ran: false; reason: 'disabled' };

// WHY: notifyQueue は Redis 接続を張るので、import を遅延し (テスト時/無効時に Redis を
// 触らない)、実際に通知するときだけ動的 import する。
async function defaultNotify(
  userId: string,
  items: ScrapedNotificationItem[]
): Promise<void> {
  const { notifyQueue } = await import('../jobs/notify-job');
  await notifyQueue.add('push', {
    userId,
    notifications: items.map((i) => ({ title: i.title, source: 'cit-portal' })),
  });
}

export async function runCitNotificationsSync(
  deps: CitNotificationsSyncDeps = {}
): Promise<CitNotificationsSyncResult> {
  if (!isCitNotificationsSyncEnabled()) return { ran: false, reason: 'disabled' };
  const cfg = getCitPortalSyncConfig();
  if (!cfg) return { ran: false, reason: 'disabled' };

  const fetchHtml = deps.fetchHtml ?? fetchCitPortalNotificationsHtml;
  const parse = deps.parse ?? parseCitPortalNotifications;
  const save =
    deps.save ??
    ((userId: string, items: ScrapedNotificationItem[]) =>
      diffAndSave(userId, 'cit-portal', items));
  const notify = deps.notify ?? defaultNotify;

  const html = await fetchHtml(
    cfg.userId,
    cfg.password,
    cfg.totpSecret,
    cfg.totpDeviceName
  );
  const items = parse(html);
  const newItems = await save(cfg.syncUserId, items);
  if (newItems.length > 0) await notify(cfg.syncUserId, newItems);
  console.log(
    `[cit-notifications-sync] user=${cfg.syncUserId} total=${items.length} new=${newItems.length}`
  );
  return { ran: true, total: items.length, new: newItems.length };
}
