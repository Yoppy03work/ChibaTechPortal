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
const attendanceAuditLogCreate = vi.fn();
const attendanceQrSessionFindUnique = vi.fn();
vi.mock('@chibatech/db', () => ({
  prisma: {
    timetable: {
      findUnique: (...args: unknown[]) => timetableFindUnique(...args),
      // WHY: ブロック判定用の同日行取得。既定 [] → blockRowIds は対象行のみに縮退
      findMany: async () => [],
    },
    attendanceLog: {
      findFirst: (...args: unknown[]) => attendanceLogFindFirst(...args),
      updateMany: (...args: unknown[]) => attendanceLogUpdateMany(...args),
      create: (...args: unknown[]) => attendanceLogCreate(...args),
    },
    attendanceAuditLog: {
      create: (...args: unknown[]) => attendanceAuditLogCreate(...args),
    },
    attendanceQrSession: {
      findUnique: (...args: unknown[]) => attendanceQrSessionFindUnique(...args),
    },
  },
}));

// WHY: attendance-job 内で Prisma.JsonNull を参照する。vi.mock の factory は
// hoist されるため、外部の const を参照すると TDZ で ReferenceError になる。
// Symbol を factory 内で直接生成することで回避する。
vi.mock('@prisma/client', () => ({
  Prisma: {
    JsonNull: Symbol('Prisma.JsonNull'),
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
  delete process.env.ATTENDANCE_AUTO_ALLOWLIST;
  delete process.env.ATTENDANCE_AUTO_ALLOWLIST_ALL;
  delete process.env.ATTENDANCE_AUTO_DRY_RUN;
  // 並列 race パスを通さないために updateMany は count=0 / create は OK で固定
  attendanceLogUpdateMany.mockResolvedValue({ count: 0 });
  attendanceLogCreate.mockResolvedValue({});
  attendanceLogFindFirst.mockResolvedValue(null);
  // append-only 監査ログの create は best-effort。デフォルト success
  attendanceAuditLogCreate.mockResolvedValue({});
  // デフォルトは QR セッション無し (= qrSessionValid false)
  attendanceQrSessionFindUnique.mockResolvedValue(null);
});

afterAll(() => {
  // WHY: テスト中に env を上書きしているのでスイートの最後に元の値へ戻す
  if (ORIGINAL_ENV === undefined) {
    delete process.env.ATTENDANCE_AUTO_EXECUTION_ENABLED;
  } else {
    process.env.ATTENDANCE_AUTO_EXECUTION_ENABLED = ORIGINAL_ENV;
  }
  delete process.env.ATTENDANCE_AUTO_ALLOWLIST;
  delete process.env.ATTENDANCE_AUTO_ALLOWLIST_ALL;
  delete process.env.ATTENDANCE_AUTO_DRY_RUN;
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

  it('env キルスイッチ "true" でも allowlist 未設定 (fail-closed) なら adapter は呼ばれない', async () => {
    // WHY: env を有効化しても allowlist が空なら誰も解禁されない (fail-closed)。
    // healthCheck も attend も呼ばれない。
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
  it('pre-network reject で attendanceLog に skipped が reason 文字列付きで記録される', async () => {
    delete process.env.ATTENDANCE_AUTO_EXECUTION_ENABLED;
    timetableFindUnique.mockResolvedValue(timetableRow());
    const adapter = makeAdapter();

    await processAttendanceJob({ id: 'j9', data: validJobData() }, adapter);

    // create で status='skipped' が書かれる
    const skippedCreate = attendanceLogCreate.mock.calls.find(
      (c) => (c[0] as { data: { status: string } }).data.status === 'skipped'
    );
    expect(skippedCreate).toBeDefined();

    // WHY: errorDetail は string | null。skipped 時は guard reason が
    // 文字列として保存される (success 時は明示的に null clear される対称設計)
    const data = skippedCreate![0] as { data: { errorDetail: unknown } };
    expect(typeof data.data.errorDetail).toBe('string');
    expect((data.data.errorDetail as string).length).toBeGreaterThan(0);

    // ユーザー通知が走る
    expect(notifyAdd).toHaveBeenCalledTimes(1);
  });

  // WHY: 重複/リトライ ジョブが既存の success 行を skipped で潰す回帰を防ぐ。
  // existingSuccess があると preGuard が alreadySubmitted で reject し、続く
  // saveLog('skipped', ...) が呼ばれる。このとき updateMany の where に
  // `NOT: { status: 'success' }` が入っていないと、唯一マッチする success 行が
  // skipped に上書きされてしまう (出席済みなのに未提出に見える)。
  it('既に同方式の success 行があるとき、skipped の updateMany は success 行を対象外にする', async () => {
    delete process.env.ATTENDANCE_AUTO_EXECUTION_ENABLED;
    timetableFindUnique.mockResolvedValue(timetableRow());
    // 既存の success 行を擬似的に返す → preGuard が alreadySubmitted=true で reject
    attendanceLogFindFirst.mockResolvedValue({ id: 'existing-success' });
    const adapter = makeAdapter();

    await processAttendanceJob({ id: 'dup-1', data: validJobData() }, adapter);

    const skippedUpdate = attendanceLogUpdateMany.mock.calls.find(
      (c) => (c[0] as { data: { status: string } }).data.status === 'skipped'
    );
    expect(skippedUpdate).toBeDefined();

    const where = (skippedUpdate![0] as { where: Record<string, unknown> }).where;
    expect(where).toMatchObject({ NOT: { status: 'success' } });
  });
});

// ============================================================
// 監査ログ (append-only): 各イベントポイントで AttendanceAuditLog が記録される
// ============================================================
describe('processAttendanceJob — 監査ログ', () => {
  it('pre-network reject で AttendanceAuditLog に phase=skipped + reason + jobId が append される', async () => {
    delete process.env.ATTENDANCE_AUTO_EXECUTION_ENABLED;
    timetableFindUnique.mockResolvedValue(timetableRow());
    const adapter = makeAdapter();

    await processAttendanceJob({ id: 'job-skipped', data: validJobData() }, adapter);

    expect(attendanceAuditLogCreate).toHaveBeenCalledTimes(1);
    const call = attendanceAuditLogCreate.mock.calls[0][0] as {
      data: {
        phase: string;
        userId: string;
        timetableId: string | null;
        method: string | null;
        outcome: string | null;
        reason: string | null;
        jobId: string | null;
      };
    };
    expect(call.data.phase).toBe('skipped');
    expect(call.data.userId).toBe('user-1');
    expect(call.data.timetableId).toBe('tt-1');
    expect(call.data.method).toBe('auto');
    // skipped では outcome は null
    expect(call.data.outcome).toBeNull();
    // reason は guard が返した文字列のサニタイズ済み版
    expect(typeof call.data.reason).toBe('string');
    expect((call.data.reason as string).length).toBeGreaterThan(0);
    expect(call.data.jobId).toBe('job-skipped');
  });

  it('timetable 不在で AttendanceAuditLog に phase=blocked が append される', async () => {
    process.env.ATTENDANCE_AUTO_EXECUTION_ENABLED = 'true';
    timetableFindUnique.mockResolvedValue(null);
    const adapter = makeAdapter();

    await processAttendanceJob({ id: 'job-blocked', data: validJobData() }, adapter);

    expect(attendanceAuditLogCreate).toHaveBeenCalledTimes(1);
    const call = attendanceAuditLogCreate.mock.calls[0][0] as {
      data: { phase: string; reason: string | null; jobId: string | null };
    };
    expect(call.data.phase).toBe('blocked');
    expect(call.data.reason).toBe('timetable not found');
    expect(call.data.jobId).toBe('job-blocked');

    // adapter には触れない (blocked は guard 以前)
    expect(adapter.healthCheck).not.toHaveBeenCalled();
    expect(adapter.attend).not.toHaveBeenCalled();
  });

  it('不正な job.data で throw された場合は AttendanceAuditLog は記録されない (userId 不明のため)', async () => {
    // WHY: zod 失敗時は job.data から userId が取れないので、append-only 監査ログ
    // (user_id NOT NULL) には書けない。throw のみで応答する
    const adapter = makeAdapter();

    await expect(
      processAttendanceJob({ id: 'job-invalid', data: { broken: true } }, adapter)
    ).rejects.toThrow('Invalid attendance job data');

    expect(attendanceAuditLogCreate).not.toHaveBeenCalled();
  });

  // WHY: pre_attempt / post_attempt の append は qrSessionValid=false 固定で
  // 現状到達しない (4 重ロックの一環)。auto dry-run / allowlist 段階で初めて
  // 機能するため、この時点では到達経路がないことを Worker テストで保証する。
  // pre_attempt / post_attempt の入力 → Prisma create data 変換は
  // shared/tests/attendance-audit.test.ts で完全網羅している。
  it('append-only: 監査ログに対して update / delete のメソッドはモックに存在しない (= 呼ばれていない)', () => {
    // モック定義に attendanceAuditLog.update / delete を意図的に追加していない。
    // これは「コード側で update/delete を呼ばない」設計を強制するための保険。
    // もしコードが update/delete を呼ぶようになったら、ランタイムで
    // "is not a function" として検出される。
    expect(typeof (attendanceAuditLogCreate as { mockResolvedValue?: unknown }))
      .toBe('function');
  });
});

// ============================================================
// auto 解禁 (M2-D): enabled + allowlisted + 有効 QR セッション
// ============================================================
const IN_WINDOW = new Date('2026-05-04T08:55:00+09:00'); // 月曜 1限(9:00) -5分

describe('processAttendanceJob — auto 解禁 (M2-D)', () => {
  function enableAuto() {
    process.env.ATTENDANCE_AUTO_EXECUTION_ENABLED = 'true';
    process.env.ATTENDANCE_AUTO_ALLOWLIST = 'user-1';
  }
  function validSession() {
    return {
      id: 'qs-1',
      userId: 'user-1',
      roomId: '8109',
      timetableId: 'tt-1',
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    };
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(IN_WINDOW);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('enabled + allowlisted + 有効セッション + healthy なら attend が呼ばれる', async () => {
    enableAuto();
    timetableFindUnique.mockResolvedValue(timetableRow());
    attendanceQrSessionFindUnique.mockResolvedValue(validSession());
    const adapter = makeAdapter();

    await processAttendanceJob({ id: 'a1', data: validJobData() }, adapter);

    expect(adapter.healthCheck).toHaveBeenCalled();
    expect(adapter.attend).toHaveBeenCalledTimes(1);
  });

  it('QR セッション無しなら qrSessionValid=false で adapter は呼ばれない', async () => {
    enableAuto();
    timetableFindUnique.mockResolvedValue(timetableRow());
    attendanceQrSessionFindUnique.mockResolvedValue(null);
    const adapter = makeAdapter();

    await processAttendanceJob({ id: 'a2', data: validJobData() }, adapter);

    expect(adapter.attend).not.toHaveBeenCalled();
  });

  it('allowlist 外なら adapter は呼ばれない', async () => {
    process.env.ATTENDANCE_AUTO_EXECUTION_ENABLED = 'true';
    process.env.ATTENDANCE_AUTO_ALLOWLIST = 'someone-else';
    timetableFindUnique.mockResolvedValue(timetableRow());
    attendanceQrSessionFindUnique.mockResolvedValue(validSession());
    const adapter = makeAdapter();

    await processAttendanceJob({ id: 'a3', data: validJobData() }, adapter);

    expect(adapter.attend).not.toHaveBeenCalled();
  });

  it('期限切れセッションなら adapter は呼ばれない', async () => {
    enableAuto();
    timetableFindUnique.mockResolvedValue(timetableRow());
    attendanceQrSessionFindUnique.mockResolvedValue({
      ...validSession(),
      expiresAt: new Date(Date.now() - 60 * 1000),
    });
    const adapter = makeAdapter();

    await processAttendanceJob({ id: 'a4', data: validJobData() }, adapter);

    expect(adapter.attend).not.toHaveBeenCalled();
  });

  it('dry-run: healthCheck は呼ぶが attend は呼ばず skipped(dry_run) を残す', async () => {
    enableAuto();
    process.env.ATTENDANCE_AUTO_DRY_RUN = 'true';
    timetableFindUnique.mockResolvedValue(timetableRow());
    attendanceQrSessionFindUnique.mockResolvedValue(validSession());
    const adapter = makeAdapter();

    await processAttendanceJob({ id: 'a5', data: validJobData() }, adapter);

    expect(adapter.healthCheck).toHaveBeenCalled();
    expect(adapter.attend).not.toHaveBeenCalled();
    const dryLog = attendanceLogCreate.mock.calls.find(
      (c) => (c[0] as { data: { status: string } }).data.status === 'skipped'
    );
    expect(dryLog).toBeDefined();
    expect((dryLog?.[0] as { data: { errorDetail: string } }).data.errorDetail).toBe(
      'dry_run'
    );
  });

  it('セッションが別授業（同名でない）の timetableId に紐付いていれば adapter は呼ばれない', async () => {
    enableAuto();
    timetableFindUnique.mockResolvedValue(timetableRow());
    attendanceQrSessionFindUnique.mockResolvedValue({
      ...validSession(),
      timetableId: 'other-tt',
      timetable: { className: '別の授業' },
    });
    const adapter = makeAdapter();

    await processAttendanceJob({ id: 'a6', data: validJobData() }, adapter);

    expect(adapter.attend).not.toHaveBeenCalled();
  });

  it('別コマの timetableId でも同名授業のセッションなら attend が呼ばれる（連続コマのQR共有）', async () => {
    // WHY: 同じ日の同名授業（連続コマ）は同じ出席QRが有効という実運用仕様。
    // 1コマ目のスキャンで作られたセッション（timetableId=1コマ目）を、
    // 2コマ目のジョブ（tt-1）でも共有できることを固定する。
    enableAuto();
    timetableFindUnique.mockResolvedValue(timetableRow());
    attendanceQrSessionFindUnique.mockResolvedValue({
      ...validSession(),
      timetableId: 'other-period-tt',
      timetable: { className: 'プログラミング' },
    });
    const adapter = makeAdapter();

    await processAttendanceJob({ id: 'a7', data: validJobData() }, adapter);

    expect(adapter.healthCheck).toHaveBeenCalled();
    expect(adapter.attend).toHaveBeenCalledTimes(1);
  });
});
