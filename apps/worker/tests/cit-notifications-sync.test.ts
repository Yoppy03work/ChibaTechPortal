/**
 * CIT 掲示板お知らせ同期 (env ベース) のテスト。
 * ゲート fail-closed と、新着があるときだけ notify する挙動を固定する。
 * 外部 I/O (fetchHtml/parse/save/notify) は注入で差し替え、ネットワーク/DB/Redis に触れない。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { ScrapedNotificationItem } from '@chibatech/shared';
import { isCitNotificationsSyncEnabled } from '../src/lib/cit-portal-env';
import { runCitNotificationsSync } from '../src/services/cit-notifications-sync';

const ENV_KEYS = [
  'SCRAPE_ENABLED',
  'CIT_NOTIFICATIONS_SYNC_ENABLED',
  'CIT_PORTAL_USER_ID',
  'CIT_PORTAL_PASSWORD',
  'CIT_PORTAL_TOTP_SECRET',
  'CIT_PORTAL_SYNC_USER_ID',
];
let saved: Record<string, string | undefined>;
function setAll() {
  process.env.SCRAPE_ENABLED = 'true';
  process.env.CIT_NOTIFICATIONS_SYNC_ENABLED = 'true';
  process.env.CIT_PORTAL_USER_ID = 'm24G1140';
  process.env.CIT_PORTAL_PASSWORD = 'pw';
  process.env.CIT_PORTAL_TOTP_SECRET = 'JBSWY3DPEHPK3PXP';
  process.env.CIT_PORTAL_SYNC_USER_ID = 'db-user-1';
}
const item = (id: string): ScrapedNotificationItem => ({
  externalId: id,
  title: 't-' + id,
  body: '',
  url: '',
  publishedAt: new Date('2026-06-23T00:00:00Z'),
});

beforeEach(() => {
  saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  for (const k of ENV_KEYS) delete process.env[k];
});
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe('isCitNotificationsSyncEnabled', () => {
  it('全ゲート + creds で true', () => {
    setAll();
    expect(isCitNotificationsSyncEnabled()).toBe(true);
  });
  it('専用フラグ無しは false', () => {
    setAll();
    delete process.env.CIT_NOTIFICATIONS_SYNC_ENABLED;
    expect(isCitNotificationsSyncEnabled()).toBe(false);
  });
  it('SCRAPE_ENABLED 無しは false', () => {
    setAll();
    process.env.SCRAPE_ENABLED = 'false';
    expect(isCitNotificationsSyncEnabled()).toBe(false);
  });
});

describe('runCitNotificationsSync', () => {
  it('無効時は外部アクセスせず disabled (fetchHtml 不呼出)', async () => {
    const fetchHtml = vi.fn();
    const r = await runCitNotificationsSync({ fetchHtml, parse: () => [], save: vi.fn(), notify: vi.fn() });
    expect(r).toEqual({ ran: false, reason: 'disabled' });
    expect(fetchHtml).not.toHaveBeenCalled();
  });

  it('有効: 新着があれば save の結果で notify を呼ぶ', async () => {
    setAll();
    const parsed = [item('a'), item('b')];
    const fetchHtml = vi.fn().mockResolvedValue('<html>');
    const save = vi.fn().mockResolvedValue([item('b')]); // b だけ新着
    const notify = vi.fn().mockResolvedValue(undefined);
    const r = await runCitNotificationsSync({ fetchHtml, parse: () => parsed, save, notify });
    expect(r).toEqual({ ran: true, total: 2, new: 1 });
    expect(save).toHaveBeenCalledWith('db-user-1', parsed);
    expect(notify).toHaveBeenCalledWith('db-user-1', [item('b')]);
  });

  it('有効でも新着 0 なら notify を呼ばない', async () => {
    setAll();
    const fetchHtml = vi.fn().mockResolvedValue('<html>');
    const save = vi.fn().mockResolvedValue([]);
    const notify = vi.fn();
    const r = await runCitNotificationsSync({ fetchHtml, parse: () => [item('a')], save, notify });
    expect(r).toEqual({ ran: true, total: 1, new: 0 });
    expect(notify).not.toHaveBeenCalled();
  });
});
