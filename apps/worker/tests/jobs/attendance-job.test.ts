/**
 * processAttendanceJob の単体テスト
 *
 * WHY: 「auto 実送信禁止」だけでなく「外部システム実アクセス禁止」を
 * 守るため、env disabled / qrSessionValid=false (= フェーズ 0 の常態) /
 * 各 guard 条件不足のいずれでも adapter.healthCheck() / adapter.attend() が
 * 呼ばれないことを固定する。
 *
 * BullMQ Queue/Worker と Redis は副作用 (実接続) を持つため、import を
 * 解決する前にモックする必要がある。
 */
import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';

// --- 副作用のあるモジュールをモック ---

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

const notifyAdd = vi.fn();
vi.mock('../../src/jobs/notify-job', () => ({
  notifyQueue: { add: (...args: unknown[]) => notifyAdd(...args) },
}));

// --- prisma モック ---

const timetableFindUnique = vi.fn();
const attendanceLogFindFirst = vi.fn();
const attendanceLogUpdateMany = vi.fn();
const attendanceLogCreate = vi.fn();
vi.mock('@chibatech/db', () => ({
  prisma: {
    timetable: {
      findUnique: (...args: unknown[]) => timetableFindUnique(...args),
    },
    attendanceLog: {
      findFirst: (...args: unknown[]) => attendanceLogFindFirst(...args),
      updateMany: (...args: unknown[]) => attendanceLogUpdateMany(...args),
      create: (...args: unknown[]) => attendanceLogCreate(...args),
    },
  },
}));

// --- shared (crypto) モック ---
// withDecryptedCredentials の中身は実 AES-GCM を要求するため、
// ここでは「呼ばれた」事実だけを検出すればよい。getMasterKey も同様。
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

// 上記モック解決後に handler を import する
import { processAttendanceJob } from '../../src/jobs/attendance-job';

// --- テスト用 fixture ---

interface MockAdapter {
  healthCheck: ReturnType<typeof vi.fn>;
  attend: ReturnType<typeof vi.fn>;
}

function makeAdapter(): MockAdapter {
  return {
    healthCheck: vi.fn().mockResolvedValue(true),
    attend: vi.fn().mockResolvedValue({ success: true, message: 'ok' }),
  };
}

function validJobData() {
  return {
    userId: 'user-1',
    timetableId: 'tt-1',
    roomId: '8109',
    className: 'プログラミング',
    method: 'auto' as const,
  };
}

function timetableRow(overrides: Partial<{
  userId: string;
  room: string | null;
  attendanceSettings: unknown;
  encryptedCitCreds: Buffer | null;
}> = {}) {
  return {
    id: 'tt-1',
    userId: overrides.userId ?? 'user-1',
    dayOfWeek: 1,
    period: 1,
    room: overrides.room === undefined ? '8109' : overrides.room,
    className: 'プログラミング',
    user: {
      encryptedCitCreds:
        overrides.encryptedCitCreds === undefined
          ? Buffer.from('encrypted')
          : overrides.encryptedCitCreds,
      attendanceSettings:
        overrides.attendanceSettings === undefined
          ? { mode: 'auto' }
          : overrides.attendanceSettings,
    },
  };
}

const ORIGINAL_ENV = process.env.ATTENDANCE_AUTO_EXECUTION_ENABLED;

beforeEach(() => {
  vi.clearAllMocks();
  // WHY: 各テストで env を明示的にセット。デフォルトは「未設定」(= disabled) に戻す
  delete process.env.ATTENDANCE_AUTO_EXECUTION_ENABLED;
  // 並列 race パスを通さないために updateMany は count=0 / create は OK で固定
  attendanceLogUpdateMany.mockResolvedValue({ count: 0 });
  attendanceLogCreate.mockResolvedValue({});
  attendanceLogFindFirst.mockResolvedValue(null);
});

afterAll(() => {
  // WHY: テスト中に env を上書きしているのでスイートの最後に元の値へ戻す
  if (ORIGINAL_ENV === undefined) {
    delete process.env.ATTENDANCE_AUTO_EXECUTION_ENABLED;
  } else {
    process.env.ATTENDANCE_AUTO_EXECUTION_ENABLED = ORIGINAL_ENV;
  }
});

// ============================================================
// 外部アクセス禁止: adapter には到達しない
// ============================================================
describe('processAttendanceJob — 外部システム実アクセス禁止', () => {
  it('env キルスイッチ未設定なら adapter.healthCheck も attend も呼ばれない', async () => {
    delete process.env.ATTENDANCE_AUTO_EXECUTION_ENABLED;
    timetableFindUnique.mockResolvedValue(timetableRow());
    const adapter = makeAdapter();

    await processAttendanceJob({ id: 'j1', data: validJobData() }, adapter);

    expect(adapter.healthCheck).not.toHaveBeenCalled();
    expect(adapter.attend).not.toHaveBeenCalled();
  });

  it('env キルスイッチが "true" でも qrSessionValid=false 固定で adapter は呼ばれない', async () => {
    // WHY: 4 重ロックの最終層。env を有効化しても、QR セッション検証 DB が
    // 入るまで qrSessionValid=false 固定なので、healthCheck も attend も呼ばれない
    process.env.ATTENDANCE_AUTO_EXECUTION_ENABLED = 'true';
    timetableFindUnique.mockResolvedValue(timetableRow());
    const adapter = makeAdapter();

    await processAttendanceJob({ id: 'j2', data: validJobData() }, adapter);

    expect(adapter.healthCheck).not.toHaveBeenCalled();
    expect(adapter.attend).not.toHaveBeenCalled();
  });

  it('storedMode が auto でなければ adapter は呼ばれない', async () => {
    process.env.ATTENDANCE_AUTO_EXECUTION_ENABLED = 'true';
    timetableFindUnique.mockResolvedValue(
      timetableRow({ attendanceSettings: { mode: 'confirm' } })
    );
    const adapter = makeAdapter();

    await processAttendanceJob({ id: 'j3', data: validJobData() }, adapter);

    expect(adapter.healthCheck).not.toHaveBeenCalled();
    expect(adapter.attend).not.toHaveBeenCalled();
  });

  it('教室不一致なら adapter は呼ばれない', async () => {
    process.env.ATTENDANCE_AUTO_EXECUTION_ENABLED = 'true';
    timetableFindUnique.mockResolvedValue(timetableRow({ room: '0000' }));
    const adapter = makeAdapter();

    await processAttendanceJob({ id: 'j4', data: validJobData() }, adapter);

    expect(adapter.healthCheck).not.toHaveBeenCalled();
    expect(adapter.attend).not.toHaveBeenCalled();
  });

  it('ジョブのユーザーと時間割所有者が異なれば adapter は呼ばれない', async () => {
    process.env.ATTENDANCE_AUTO_EXECUTION_ENABLED = 'true';
    timetableFindUnique.mockResolvedValue(timetableRow({ userId: 'attacker' }));
    const adapter = makeAdapter();

    await processAttendanceJob({ id: 'j5', data: validJobData() }, adapter);

    expect(adapter.healthCheck).not.toHaveBeenCalled();
    expect(adapter.attend).not.toHaveBeenCalled();
  });

  it('既に成功ログがあれば adapter は呼ばれない (重複送信防止)', async () => {
    process.env.ATTENDANCE_AUTO_EXECUTION_ENABLED = 'true';
    timetableFindUnique.mockResolvedValue(timetableRow());
    attendanceLogFindFirst.mockResolvedValue({ id: 'log-1', status: 'success' });
    const adapter = makeAdapter();

    await processAttendanceJob({ id: 'j6', data: validJobData() }, adapter);

    expect(adapter.healthCheck).not.toHaveBeenCalled();
    expect(adapter.attend).not.toHaveBeenCalled();
  });

  it('timetable が見つからなければ adapter は一切呼ばれない', async () => {
    process.env.ATTENDANCE_AUTO_EXECUTION_ENABLED = 'true';
    timetableFindUnique.mockResolvedValue(null);
    const adapter = makeAdapter();

    await processAttendanceJob({ id: 'j7', data: validJobData() }, adapter);

    expect(adapter.healthCheck).not.toHaveBeenCalled();
    expect(adapter.attend).not.toHaveBeenCalled();
  });

  it('不正な job.data なら throw され adapter は呼ばれない', async () => {
    const adapter = makeAdapter();

    await expect(
      processAttendanceJob({ id: 'j8', data: { broken: true } }, adapter)
    ).rejects.toThrow('Invalid attendance job data');

    expect(adapter.healthCheck).not.toHaveBeenCalled();
    expect(adapter.attend).not.toHaveBeenCalled();
    // DB にも触れていないこと
    expect(timetableFindUnique).not.toHaveBeenCalled();
  });
});

// ============================================================
// skip ログと通知が記録されること (実送信は走っていない経路)
// ============================================================
describe('processAttendanceJob — pre-network reject 時のログ/通知', () => {
  it('pre-network reject で attendanceLog に skipped が記録される', async () => {
    delete process.env.ATTENDANCE_AUTO_EXECUTION_ENABLED;
    timetableFindUnique.mockResolvedValue(timetableRow());
    const adapter = makeAdapter();

    await processAttendanceJob({ id: 'j9', data: validJobData() }, adapter);

    // create または updateMany のいずれかで status='skipped' が書かれる
    const skippedCreate = attendanceLogCreate.mock.calls.find(
      (c) => (c[0] as { data: { status: string } }).data.status === 'skipped'
    );
    expect(skippedCreate).toBeDefined();

    // ユーザー通知が走る
    expect(notifyAdd).toHaveBeenCalledTimes(1);
  });
});
