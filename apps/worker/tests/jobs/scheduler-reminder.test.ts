/**
 * scheduler の confirm リマインダのテスト
 *
 * WHY: confirm モードのユーザに授業開始 REMINDER_LEAD_MINUTES 分前 push を投入する。
 * CONFIRM_REMINDER_ENABLED ゲート / mode フィルタ / 時刻判定 (JST) / jobId を固定する。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../../src/jobs/scrape-job', () => ({ scrapeQueue: { add: vi.fn() } }));
vi.mock('../../src/jobs/attendance-job', () => ({ attendanceQueue: { add: vi.fn() } }));
const notifyAdd = vi.fn();
vi.mock('../../src/jobs/notify-job', () => ({
  notifyQueue: { add: (...a: unknown[]) => notifyAdd(...a) },
}));

const timetableFindMany = vi.fn();
vi.mock('@chibatech/db', () => ({
  prisma: {
    timetable: { findMany: (...a: unknown[]) => timetableFindMany(...a) },
    user: { findMany: vi.fn() },
  },
}));

import { enqueueConfirmReminders } from '../../src/jobs/scheduler';

// 2026-05-03T23:50:00Z = JST 月曜 08:50 = 1限(9:00) の 10 分前 = リマインダ時刻
const REMINDER_TIME = new Date('2026-05-03T23:50:00Z');

function ttRow(mode: string) {
  return {
    id: 'tt-1',
    userId: 'u1',
    className: 'プログラミング',
    user: { attendanceSettings: { mode } },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  notifyAdd.mockReset();
  timetableFindMany.mockReset();
  timetableFindMany.mockResolvedValue([ttRow('confirm')]);
  vi.useFakeTimers();
  vi.setSystemTime(REMINDER_TIME);
  delete process.env.CONFIRM_REMINDER_ENABLED;
});

afterEach(() => {
  vi.useRealTimers();
  delete process.env.CONFIRM_REMINDER_ENABLED;
});

describe('enqueueConfirmReminders', () => {
  it('CONFIRM_REMINDER_ENABLED 未設定なら何もしない', async () => {
    await enqueueConfirmReminders();
    expect(timetableFindMany).not.toHaveBeenCalled();
    expect(notifyAdd).not.toHaveBeenCalled();
  });

  it('リマインダ時刻 + confirm モードなら notify を投入する', async () => {
    process.env.CONFIRM_REMINDER_ENABLED = 'true';
    await enqueueConfirmReminders();

    expect(notifyAdd).toHaveBeenCalledTimes(1);
    const [name, data, opts] = notifyAdd.mock.calls[0];
    expect(name).toBe('notify');
    expect(
      (data as { notifications: { source: string }[] }).notifications[0].source
    ).toBe('attendance');
    expect((opts as { jobId: string }).jobId).toBe('reminder-u1-tt-1-2026-05-04');
  });

  it('auto / manual モードのユーザには投入しない', async () => {
    process.env.CONFIRM_REMINDER_ENABLED = 'true';
    timetableFindMany.mockResolvedValue([ttRow('auto')]);
    await enqueueConfirmReminders();
    expect(notifyAdd).not.toHaveBeenCalled();
  });

  it('リマインダ時刻でない分には投入しない (09:25 はどの時限のリマインダ時刻でもない)', async () => {
    process.env.CONFIRM_REMINDER_ENABLED = 'true';
    vi.setSystemTime(new Date('2026-05-04T00:25:00Z'));
    await enqueueConfirmReminders();
    expect(notifyAdd).not.toHaveBeenCalled();
  });
});
