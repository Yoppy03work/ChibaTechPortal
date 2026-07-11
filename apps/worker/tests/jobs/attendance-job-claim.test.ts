/**
 * processAttendanceJob の claim-before-attend (二重送信防止) テスト
 *
 * WHY: adapter.attend() の前に pending 行を unique 制約で確保し、再入時に既存行 +
 * pre_attempt 監査ログを見て「絶対に二重送信しない」判断をする。attend 成功後
 * saveLog 前のクラッシュ → 再試行で二重送信、という at-least-once の穴を塞ぐ。
 */
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('bullmq', () => ({
  Queue: vi.fn().mockImplementation(() => ({ add: vi.fn() })),
  Worker: vi.fn().mockImplementation(() => ({ on: vi.fn() })),
}));

vi.mock('../../src/lib/redis', () => ({
  bullmqConnection: {},
  redis: { quit: vi.fn() },
}));

vi.mock('../../src/scrapers/adapter-factory', () => ({
  createAttendanceAdapter: () => ({ healthCheck: vi.fn(), attend: vi.fn() }),
}));

const notifyAdd = vi.fn();
vi.mock('../../src/jobs/notify-job', () => ({
  notifyQueue: { add: (...args: unknown[]) => notifyAdd(...args) },
}));

const timetableFindUnique = vi.fn();
const attendanceLogFindFirst = vi.fn();
const attendanceLogFindUnique = vi.fn();
const attendanceLogUpdateMany = vi.fn();
const attendanceLogCreate = vi.fn();
const attendanceAuditLogCreate = vi.fn();
const attendanceAuditLogFindFirst = vi.fn();
vi.mock('@chibatech/db', () => ({
  prisma: {
    timetable: { findUnique: (...a: unknown[]) => timetableFindUnique(...a) },
    attendanceLog: {
      findFirst: (...a: unknown[]) => attendanceLogFindFirst(...a),
      findUnique: (...a: unknown[]) => attendanceLogFindUnique(...a),
      updateMany: (...a: unknown[]) => attendanceLogUpdateMany(...a),
      create: (...a: unknown[]) => attendanceLogCreate(...a),
    },
    attendanceAuditLog: {
      create: (...a: unknown[]) => attendanceAuditLogCreate(...a),
      findFirst: (...a: unknown[]) => attendanceAuditLogFindFirst(...a),
    },
  },
}));

vi.mock('@prisma/client', () => ({
  Prisma: { JsonNull: Symbol('Prisma.JsonNull') },
}));

vi.mock('@chibatech/shared', async () => {
  const actual = await vi.importActual<object>('@chibatech/shared');
  return {
    ...actual,
    getMasterKey: () => Buffer.alloc(32),
    withDecryptedCredentials: async (
      _enc: Buffer,
      _key: Buffer,
      cb: (creds: { userId: string; password: string }) => Promise<void>
    ) => {
      await cb({ userId: 'cit-id', password: 'cit-pw' });
    },
  };
});

import { processAttendanceJob } from '../../src/jobs/attendance-job';

const IN_WINDOW = new Date('2026-05-04T08:55:00+09:00'); // 月曜 1限(9:00) -5分

function makeAdapter() {
  return {
    healthCheck: vi.fn().mockResolvedValue(true),
    attend: vi.fn().mockResolvedValue({ success: true, message: 'ok' }),
  };
}

function timetableRow() {
  return {
    id: 'tt-1',
    userId: 'user-1',
    dayOfWeek: 1,
    period: 1,
    room: '8109',
    className: 'プログラミング',
    user: {
      encryptedCitCreds: Buffer.from('encrypted'),
      attendanceSettings: { mode: 'confirm' },
    },
  };
}

function confirmJobData() {
  return {
    userId: 'user-1',
    timetableId: 'tt-1',
    roomId: '8109',
    className: 'プログラミング',
    method: 'confirm' as const,
  };
}

function p2002(): Error {
  return Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
}

beforeEach(() => {
  vi.clearAllMocks();
  timetableFindUnique.mockResolvedValue(timetableRow());
  attendanceLogFindFirst.mockResolvedValue(null); // existingSuccess なし → guard 通過
  attendanceLogFindUnique.mockResolvedValue(null);
  attendanceLogUpdateMany.mockResolvedValue({ count: 0 });
  attendanceLogCreate.mockResolvedValue({});
  attendanceAuditLogCreate.mockResolvedValue({});
  attendanceAuditLogFindFirst.mockResolvedValue(null);
  vi.useFakeTimers();
  vi.setSystemTime(IN_WINDOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('processAttendanceJob — claim-before-attend', () => {
  it('claim 獲得 (pending create 成功) → attend が 1 回呼ばれ pending を立てる', async () => {
    const adapter = makeAdapter();
    await processAttendanceJob({ id: 'j1', data: confirmJobData() }, adapter);

    // claim の pending create が attend より前に呼ばれている
    const pendingCreate = attendanceLogCreate.mock.calls.find(
      (c) => (c[0] as { data: { status: string } }).data.status === 'pending'
    );
    expect(pendingCreate).toBeDefined();
    expect(adapter.attend).toHaveBeenCalledTimes(1);
  });

  it('claim 時に既に success 行あり (race) → attend を呼ばない', async () => {
    attendanceLogCreate.mockRejectedValueOnce(p2002());
    attendanceLogFindUnique.mockResolvedValue({ id: 'x', status: 'success' });
    const adapter = makeAdapter();

    await processAttendanceJob({ id: 'j2', data: confirmJobData() }, adapter);

    expect(adapter.attend).not.toHaveBeenCalled();
    // skipped 監査が already_submitted で残る
    const skipped = attendanceAuditLogCreate.mock.calls.find(
      (c) => (c[0] as { data: { phase: string; reason?: string } }).data.phase === 'skipped'
    );
    expect((skipped?.[0] as { data: { reason: string } }).data.reason).toBe('already_submitted');
  });

  it('既存 failed 行 + pre_attempt 監査なし (attend 未到達の失敗) は reclaim して attend', async () => {
    attendanceLogCreate.mockRejectedValueOnce(p2002());
    attendanceLogFindUnique.mockResolvedValue({ id: 'x', status: 'failed' });
    // attendanceAuditLogFindFirst は null (beforeEach) = attend 未到達 → reclaim 可
    const adapter = makeAdapter();

    await processAttendanceJob({ id: 'j3', data: confirmJobData() }, adapter);

    // reclaim の updateMany が NOT success / pending で呼ばれている
    const reclaim = attendanceLogUpdateMany.mock.calls.find(
      (c) =>
        (c[0] as { data: { status: string }; where: { NOT?: unknown } }).data.status === 'pending'
    );
    expect(reclaim).toBeDefined();
    expect((reclaim?.[0] as { where: { NOT: unknown } }).where.NOT).toEqual({ status: 'success' });
    expect(adapter.attend).toHaveBeenCalledTimes(1);
  });

  it('pending 行 + pre_attempt 監査あり (attend 後クラッシュ疑い) → 再送しない', async () => {
    attendanceLogCreate.mockRejectedValueOnce(p2002());
    attendanceLogFindUnique.mockResolvedValue({ id: 'x', status: 'pending' });
    attendanceAuditLogFindFirst.mockResolvedValue({ id: 'a', phase: 'pre_attempt' });
    const adapter = makeAdapter();

    await processAttendanceJob({ id: 'j4', data: confirmJobData() }, adapter);

    expect(adapter.attend).not.toHaveBeenCalled();
    const skipped = attendanceAuditLogCreate.mock.calls.find(
      (c) => (c[0] as { data: { phase: string } }).data.phase === 'skipped'
    );
    expect((skipped?.[0] as { data: { reason: string } }).data.reason).toBe(
      'possible_prior_submit'
    );
  });

  it('pending 行だが pre_attempt 監査なし (attend 前クラッシュ) → reclaim して attend', async () => {
    attendanceLogCreate.mockRejectedValueOnce(p2002());
    attendanceLogFindUnique.mockResolvedValue({ id: 'x', status: 'pending' });
    attendanceAuditLogFindFirst.mockResolvedValue(null);
    const adapter = makeAdapter();

    await processAttendanceJob({ id: 'j5', data: confirmJobData() }, adapter);

    expect(adapter.attend).toHaveBeenCalledTimes(1);
  });

  // WHY: レビュー指摘の確定ブロッカー回帰防止。attempt1 の POST が CIT に登録されたのに
  // 応答が失われ 'failed' になったケースで、再送 = 二重送信を防ぐ。failed でも pre_attempt
  // 監査があれば attend 到達済みとみなして再送しない。
  it('既存 failed 行 + pre_attempt 監査あり (lost-response 疑い) → 再送しない', async () => {
    attendanceLogCreate.mockRejectedValueOnce(p2002());
    attendanceLogFindUnique.mockResolvedValue({ id: 'x', status: 'failed' });
    attendanceAuditLogFindFirst.mockResolvedValue({ id: 'a', phase: 'pre_attempt' });
    const adapter = makeAdapter();

    await processAttendanceJob({ id: 'j6', data: confirmJobData() }, adapter);

    expect(adapter.attend).not.toHaveBeenCalled();
    const skipped = attendanceAuditLogCreate.mock.calls.find(
      (c) => (c[0] as { data: { phase: string } }).data.phase === 'skipped'
    );
    expect((skipped?.[0] as { data: { reason: string } }).data.reason).toBe(
      'possible_prior_submit'
    );
  });

  // WHY: claim create が P2002 以外で失敗したら握り潰さず throw し、BullMQ にジョブ失敗を
  // 伝える (監査込みで再実行される)。誤って続行して attend しないこと。
  it('claim create が非 P2002 で失敗したら rethrow し attend しない', async () => {
    attendanceLogCreate.mockRejectedValueOnce(new Error('db down'));
    const adapter = makeAdapter();

    await expect(
      processAttendanceJob({ id: 'j7', data: confirmJobData() }, adapter)
    ).rejects.toThrow('db down');
    expect(adapter.attend).not.toHaveBeenCalled();
  });
});
