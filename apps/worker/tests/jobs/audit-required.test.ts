/**
 * recordAuditRequired / recordAuditBestEffort の挙動テスト
 *
 * WHY: pre_attempt の監査ログは「送信前に必ず記録される」必要があり、失敗時に
 * 例外を投げて呼び出し元の処理 (adapter.attend) に進ませない設計。これを直接
 * unit test で固定する。
 *
 * processAttendanceJob 経由の結合テストは現状 qrSessionValid=false 固定で
 * pre_attempt まで到達する経路がないため、本ファイルでは export された
 * recordAuditRequired を直接呼んで例外伝播を確認する。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// BullMQ Queue/Worker と Redis は副作用 (実接続) を持つので import 解決前にモック
vi.mock('bullmq', () => ({
  Queue: vi.fn().mockImplementation(() => ({ add: vi.fn() })),
  Worker: vi.fn().mockImplementation(() => ({ on: vi.fn() })),
}));

vi.mock('../../src/lib/redis', () => ({
  bullmqConnection: {},
  redis: { quit: vi.fn() },
}));

vi.mock('../../src/scrapers/adapter-factory', () => ({
  createAttendanceAdapter: () => ({
    healthCheck: vi.fn(),
    attend: vi.fn(),
  }),
}));

vi.mock('../../src/jobs/notify-job', () => ({
  notifyQueue: { add: vi.fn() },
}));

// prisma の attendanceAuditLog.create のみ使う。他は不要だが import を通すため定義
const attendanceAuditLogCreate = vi.fn();
vi.mock('@chibatech/db', () => ({
  prisma: {
    timetable: { findUnique: vi.fn() },
    attendanceLog: {
      findFirst: vi.fn(),
      updateMany: vi.fn(),
      create: vi.fn(),
    },
    attendanceAuditLog: {
      create: (...args: unknown[]) => attendanceAuditLogCreate(...args),
    },
  },
}));

vi.mock('@prisma/client', () => ({
  Prisma: {
    JsonNull: Symbol('Prisma.JsonNull'),
  },
}));

import { recordAuditRequired } from '../../src/jobs/attendance-job';

describe('recordAuditRequired', () => {
  beforeEach(() => {
    attendanceAuditLogCreate.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('成功時は値を返さず、prisma.attendanceAuditLog.create を 1 度呼ぶ', async () => {
    attendanceAuditLogCreate.mockResolvedValue({});

    await expect(
      recordAuditRequired({
        userId: 'user-1',
        phase: 'pre_attempt',
        timetableId: 'tt-1',
        method: 'auto',
        jobId: 'job-1',
      })
    ).resolves.toBeUndefined();

    expect(attendanceAuditLogCreate).toHaveBeenCalledTimes(1);
  });

  it('prisma.create が reject すると例外を伝播する (best-effort と違って握りつぶさない)', async () => {
    // WHY: pre_attempt の必須記録要件。失敗を握りつぶしてしまうと
    // 監査ログ無しで adapter.attend に進む経路ができてしまう
    const dbError = new Error('audit DB unavailable');
    attendanceAuditLogCreate.mockRejectedValue(dbError);

    await expect(
      recordAuditRequired({
        userId: 'user-1',
        phase: 'pre_attempt',
        timetableId: 'tt-1',
        method: 'auto',
      })
    ).rejects.toThrow('audit DB unavailable');
  });

  it('Prisma.JsonNull が metadata 未指定時に渡される', async () => {
    // WHY: shared 側は Prisma 非依存で metadata=null を出すが、Prisma の
    // Json? カラムに null を直接書けないため worker 側で JsonNull に変換。
    // この経路が壊れると DB 書き込み自体が失敗する。
    attendanceAuditLogCreate.mockResolvedValue({});

    await recordAuditRequired({
      userId: 'user-1',
      phase: 'pre_attempt',
      method: 'auto',
    });

    const call = attendanceAuditLogCreate.mock.calls[0][0] as {
      data: { metadata: unknown };
    };
    // mock 上 Prisma.JsonNull は Symbol。識別は型ではなく値の存在のみ
    expect(call.data.metadata).toBeDefined();
    expect(typeof call.data.metadata).toBe('symbol');
  });

  it('metadata を渡すと InputJsonValue として渡される', async () => {
    attendanceAuditLogCreate.mockResolvedValue({});

    await recordAuditRequired({
      userId: 'user-1',
      phase: 'post_attempt',
      outcome: 'success',
      method: 'auto',
      metadata: { sanitizedMessage: 'OK' },
    });

    const call = attendanceAuditLogCreate.mock.calls[0][0] as {
      data: { metadata: Record<string, unknown> };
    };
    expect(call.data.metadata).toEqual({ sanitizedMessage: 'OK' });
  });
});
