/**
 * CIT 時間割 SSO 同期 (env ベース) のテスト。
 *
 * WHY: secret は DB ではなく env から読む方針。ゲート (SCRAPE_ENABLED +
 * CIT_TIMETABLE_SYNC_ENABLED + creds 揃い) が満たされないと外部 SSO ログインが
 * 走らない fail-closed を固定し、0 コマ時に DB を触らない安全策も固定する。
 * 外部 I/O (fetchHtml/parse/sync) は注入で差し替え、ネットワーク/DB に触れない。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { ScrapedTimetableEntry } from '@chibatech/shared';
import {
  getCitPortalSyncConfig,
  isCitTimetableSyncEnabled,
} from '../src/lib/cit-portal-env';
import { runCitTimetableSync } from '../src/services/cit-timetable-sync';

const ENV_KEYS = [
  'SCRAPE_ENABLED',
  'CIT_TIMETABLE_SYNC_ENABLED',
  'CIT_PORTAL_USER_ID',
  'CIT_PORTAL_PASSWORD',
  'CIT_PORTAL_TOTP_SECRET',
  'CIT_PORTAL_TOTP_DEVICE',
  'CIT_PORTAL_SYNC_USER_ID',
];
let saved: Record<string, string | undefined>;

function setAll() {
  process.env.SCRAPE_ENABLED = 'true';
  process.env.CIT_TIMETABLE_SYNC_ENABLED = 'true';
  process.env.CIT_PORTAL_USER_ID = 'm24G1140';
  process.env.CIT_PORTAL_PASSWORD = 'pw';
  process.env.CIT_PORTAL_TOTP_SECRET = 'JBSWY3DP EHPK3PXP'; // 表示用スペース入り
  process.env.CIT_PORTAL_SYNC_USER_ID = 'db-user-1';
}

const sample: ScrapedTimetableEntry[] = [
  { dayOfWeek: 2, period: 1, className: '線形代数', room: '７３１講義室', classId: null },
];

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

describe('getCitPortalSyncConfig', () => {
  it('必須が揃えば config を返し、TOTP secret の空白を除去・大文字化する', () => {
    setAll();
    const c = getCitPortalSyncConfig();
    expect(c).not.toBeNull();
    expect(c!.totpSecret).toBe('JBSWY3DPEHPK3PXP');
    expect(c!.syncUserId).toBe('db-user-1');
    expect(c!.totpDeviceName).toBeNull();
  });

  it('どれか欠ければ null (fail-closed)', () => {
    setAll();
    delete process.env.CIT_PORTAL_TOTP_SECRET;
    expect(getCitPortalSyncConfig()).toBeNull();
  });
});

describe('isCitTimetableSyncEnabled', () => {
  it('全ゲート + creds 揃いで true', () => {
    setAll();
    expect(isCitTimetableSyncEnabled()).toBe(true);
  });
  it('SCRAPE_ENABLED 無しは false', () => {
    setAll();
    process.env.SCRAPE_ENABLED = 'false';
    expect(isCitTimetableSyncEnabled()).toBe(false);
  });
  it('CIT_TIMETABLE_SYNC_ENABLED 無しは false', () => {
    setAll();
    delete process.env.CIT_TIMETABLE_SYNC_ENABLED;
    expect(isCitTimetableSyncEnabled()).toBe(false);
  });
  it('creds 欠如は false', () => {
    setAll();
    delete process.env.CIT_PORTAL_PASSWORD;
    expect(isCitTimetableSyncEnabled()).toBe(false);
  });
});

describe('runCitTimetableSync', () => {
  it('無効時は外部アクセスせず disabled を返す (fetchHtml を呼ばない)', async () => {
    const fetchHtml = vi.fn();
    const sync = vi.fn();
    const r = await runCitTimetableSync({ fetchHtml, sync, parse: () => sample });
    expect(r).toEqual({ ran: false, reason: 'disabled' });
    expect(fetchHtml).not.toHaveBeenCalled();
    expect(sync).not.toHaveBeenCalled();
  });

  it('有効 + コマありなら parse 結果で syncTimetable を呼ぶ', async () => {
    setAll();
    const fetchHtml = vi.fn().mockResolvedValue('<html>...</html>');
    const sync = vi.fn().mockResolvedValue(undefined);
    const r = await runCitTimetableSync({ fetchHtml, sync, parse: () => sample });
    expect(r).toEqual({ ran: true, synced: 1 });
    expect(fetchHtml).toHaveBeenCalledWith('m24G1140', 'pw', 'JBSWY3DPEHPK3PXP', null);
    expect(sync).toHaveBeenCalledWith('db-user-1', sample);
  });

  it('有効でも 0 コマなら DB を触らない (empty)', async () => {
    setAll();
    const fetchHtml = vi.fn().mockResolvedValue('<html></html>');
    const sync = vi.fn();
    const r = await runCitTimetableSync({ fetchHtml, sync, parse: () => [] });
    expect(r).toEqual({ ran: false, reason: 'empty' });
    expect(sync).not.toHaveBeenCalled();
  });
});
