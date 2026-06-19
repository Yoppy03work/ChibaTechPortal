/**
 * scheduler の auto enqueue ゲートのテスト (M2-D)
 *
 * WHY: auto は最高リスク。Scheduler は enabled + allowlisted + 有効 QR セッションが
 * 揃ったときだけ auto ジョブを enqueue する (fail-closed)。既定では何も投入しない。
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

const IN_WINDOW = new Date('2026-05-04T09:25:00+09:00'); // 月曜 1限 -5分

function ttRow() {
  return {
    id: 'tt-1',
    userId: 'user-1',
    room: '8109',
    className: 'プログラミング',
    user: {
      encryptedCitCreds: Buffer.from('x'),
      attendanceSettings: { mode: 'auto' },
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
  delete process.env.ATTENDANCE_AUTO_EXECUTION_ENABLED;
  delete process.env.ATTENDANCE_AUTO_ALLOWLIST;
  vi.useFakeTimers();
  vi.setSystemTime(IN_WINDOW);
});

afterEach(() => {
  vi.useRealTimers();
  delete process.env.ATTENDANCE_AUTO_EXECUTION_ENABLED;
  delete process.env.ATTENDANCE_AUTO_ALLOWLIST;
});

describe('enqueueAttendanceJobs — auto enqueue ゲート', () => {
  it('既定 (フラグ無し) では何も enqueue しない', async () => {
    await enqueueAttendanceJobs();
    expect(attendanceAdd).not.toHaveBeenCalled();
  });

  it('enabled + allowlisted + 有効セッション なら auto を enqueue する', async () => {
    process.env.ATTENDANCE_AUTO_EXECUTION_ENABLED = 'true';
    process.env.ATTENDANCE_AUTO_ALLOWLIST = 'user-1';
    await enqueueAttendanceJobs();

    expect(attendanceAdd).toHaveBeenCalledTimes(1);
    const [name, data, opts] = attendanceAdd.mock.calls[0];
    expect(name).toBe('attend');
    expect((data as { method: string }).method).toBe('auto');
    expect((opts as { jobId: string }).jobId).toBe('auto-user-1-tt-1-2026-05-04');
  });

  it('enabled だが allowlist 外なら enqueue しない', async () => {
    process.env.ATTENDANCE_AUTO_EXECUTION_ENABLED = 'true';
    process.env.ATTENDANCE_AUTO_ALLOWLIST = 'other-user';
    await enqueueAttendanceJobs();
    expect(attendanceAdd).not.toHaveBeenCalled();
  });

  it('enabled + allowlisted でも有効セッション無しなら enqueue しない', async () => {
    process.env.ATTENDANCE_AUTO_EXECUTION_ENABLED = 'true';
    process.env.ATTENDANCE_AUTO_ALLOWLIST = 'user-1';
    qrSessionFindFirst.mockResolvedValue(null);
    await enqueueAttendanceJobs();
    expect(attendanceAdd).not.toHaveBeenCalled();
  });
});
