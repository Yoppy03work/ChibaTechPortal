/**
 * scheduler の auto enqueue ゲートのテスト (dev-code 方式)
 *
 * WHY: auto は最高リスク。Scheduler は「ユーザーが開発者コードで解禁済み
 * (attendanceSettings.autoUnlocked=true) + mode=auto + 有効 QR セッション」が揃った
 * ときだけ auto ジョブを enqueue する (fail-closed)。未解禁では何も投入しない。
 * Worker が最終ゲートだが、Scheduler 側の gate も固定する。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../../src/jobs/scrape-job', () => ({ scrapeQueue: { add: vi.fn() } }));
const attendanceAdd = vi.fn();
vi.mock('../../src/jobs/attendance-job', () => ({
  attendanceQueue: { add: (...a: unknown[]) => attendanceAdd(...a) },
}));
vi.mock('../../src/jobs/notify-job', () => ({ notifyQueue: { add: vi.fn() } }));

const timetableFindMany = vi.fn();
const qrSessionFindFirst = vi.fn();
vi.mock('@chibatech/db', () => ({
  prisma: {
    timetable: { findMany: (...a: unknown[]) => timetableFindMany(...a) },
    attendanceQrSession: { findFirst: (...a: unknown[]) => qrSessionFindFirst(...a) },
    user: { findMany: vi.fn() },
  },
}));

import { enqueueAttendanceJobs } from '../../src/jobs/scheduler';

const IN_WINDOW = new Date('2026-05-04T08:55:00+09:00'); // 月曜 1限(9:00) -5分

function ttRow(attendanceSettings: unknown = { mode: 'auto', autoUnlocked: true }) {
  return {
    id: 'tt-1',
    userId: 'user-1',
    room: '8109',
    className: 'プログラミング',
    user: {
      encryptedCitCreds: Buffer.from('x'),
      attendanceSettings,
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  attendanceAdd.mockReset();
  timetableFindMany.mockReset();
  qrSessionFindFirst.mockReset();
  timetableFindMany.mockResolvedValue([ttRow()]);
  qrSessionFindFirst.mockResolvedValue({ id: 'qs-1' });
  vi.useFakeTimers();
  vi.setSystemTime(IN_WINDOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('enqueueAttendanceJobs — auto enqueue ゲート', () => {
  it('mode=auto でも未解禁 (autoUnlocked=false) なら何も enqueue しない', async () => {
    timetableFindMany.mockResolvedValue([ttRow({ mode: 'auto', autoUnlocked: false })]);
    await enqueueAttendanceJobs();
    expect(attendanceAdd).not.toHaveBeenCalled();
  });

  it('autoUnlocked=true + 有効セッション なら auto を enqueue する', async () => {
    await enqueueAttendanceJobs();

    expect(attendanceAdd).toHaveBeenCalledTimes(1);
    const [name, data, opts] = attendanceAdd.mock.calls[0];
    expect(name).toBe('attend');
    expect((data as { method: string }).method).toBe('auto');
    expect((opts as { jobId: string }).jobId).toBe('auto-user-1-tt-1-2026-05-04');
  });

  it('mode が auto でなければ (confirm) enqueue しない', async () => {
    timetableFindMany.mockResolvedValue([ttRow({ mode: 'confirm', autoUnlocked: true })]);
    await enqueueAttendanceJobs();
    expect(attendanceAdd).not.toHaveBeenCalled();
  });

  it('autoUnlocked=true でも有効セッション無しなら enqueue しない', async () => {
    qrSessionFindFirst.mockResolvedValue(null);
    await enqueueAttendanceJobs();
    expect(attendanceAdd).not.toHaveBeenCalled();
  });
});
