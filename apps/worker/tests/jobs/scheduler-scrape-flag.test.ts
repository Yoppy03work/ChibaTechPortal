/**
 * scheduler の SCRAPE_ENABLED ゲートのテスト
 *
 * WHY: スクレイピングは既定オフ（外部アクセスしない dark default）。
 * SCRAPE_ENABLED=true のときだけ enqueueScrapeJobs がジョブを投入することを固定し、
 * テスト/ドライランで意図しない CIT Portal / manaba アクセスが起きない回帰を防ぐ。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// WHY: scheduler は import 時に scrape-job / attendance-job の BullMQ Queue
// (Redis 接続) を生成するため、両モジュールを mock して実接続を避ける。
const scrapeAdd = vi.fn();
vi.mock('../../src/jobs/scrape-job', () => ({
  scrapeQueue: { add: (...args: unknown[]) => scrapeAdd(...args) },
}));
vi.mock('../../src/jobs/attendance-job', () => ({
  attendanceQueue: { add: vi.fn() },
}));

const userFindMany = vi.fn();
vi.mock('@chibatech/db', () => ({
  prisma: {
    user: { findMany: (...args: unknown[]) => userFindMany(...args) },
    timetable: { findMany: vi.fn() },
  },
}));

import { enqueueScrapeJobs } from '../../src/jobs/scheduler';

beforeEach(() => {
  vi.clearAllMocks();
  scrapeAdd.mockReset();
  userFindMany.mockReset();
  // CIT creds を持つユーザ 1 人（cit-portal が対象）
  userFindMany.mockResolvedValue([
    { id: 'u1', encryptedCitCreds: Buffer.from('x'), encryptedManabaCreds: null },
  ]);
  // WHY: isActiveHour() は local getHours() を使う。CI=UTC / dev=JST の双方で
  // active 帯 (7:00-22:00) に入る 12:00Z (UTC 12時 / JST 21時) に固定する。
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-06-18T12:00:00Z'));
  delete process.env.SCRAPE_ENABLED;
});

afterEach(() => {
  vi.useRealTimers();
  delete process.env.SCRAPE_ENABLED;
});

describe('enqueueScrapeJobs — SCRAPE_ENABLED ゲート', () => {
  it('SCRAPE_ENABLED 未設定なら scrape ジョブを投入せず、ユーザ取得にも到達しない', async () => {
    await enqueueScrapeJobs();
    expect(scrapeAdd).not.toHaveBeenCalled();
    expect(userFindMany).not.toHaveBeenCalled();
  });

  it('SCRAPE_ENABLED=false でも投入しない', async () => {
    process.env.SCRAPE_ENABLED = 'false';
    await enqueueScrapeJobs();
    expect(scrapeAdd).not.toHaveBeenCalled();
  });

  it('SCRAPE_ENABLED=true かつ active hour なら creds ユーザに cit-portal を投入する', async () => {
    process.env.SCRAPE_ENABLED = 'true';
    await enqueueScrapeJobs();
    expect(userFindMany).toHaveBeenCalledTimes(1);
    expect(scrapeAdd).toHaveBeenCalledTimes(1);
    expect(scrapeAdd).toHaveBeenCalledWith(
      'cit-portal',
      expect.objectContaining({ userId: 'u1', target: 'cit-portal' }),
      expect.any(Object)
    );
  });
});
