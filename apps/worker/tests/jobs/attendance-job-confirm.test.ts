/**
 * processAttendanceJob の confirm 経路テスト
 *
 * WHY: method='confirm' のジョブを受け取った時、confirm-guard を通って
 * adapter.attend に到達するパスと、各 guard reject で adapter が呼ばれない
 * パスを固定する。auto と違って qrSessionValid を要求しないが、room mismatch /
 * 時刻ウィンドウ / 重複 / creds / 所有確認 の各条件を満たす必要がある。
 *
 * 時刻依存テストは vi.useFakeTimers + setSystemTime で確実に固定する。
 */
import { afterAll, beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

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

const timetableFindUnique = vi.fn();
const attendanceLogFindFirst = vi.fn();
const attendanceLogUpdateMany = vi.fn();
const attendanceLogCreate = vi.fn();
const attendanceAuditLogCreate = vi.fn();
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

// shared の crypto は AES を要求するためモック
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

function timetableRow(overrides: Partial<{
  userId: string;
  room: string | null;
  encryptedCitCreds: Buffer | null;
  attendanceSettings: unknown;
}> = {}) {
  return {
    id: 'tt-1',
    userId: overrides.userId ?? 'user-1',
    dayOfWeek: 1, // 月曜
    period: 1, // 1限
    room: overrides.room === undefined ? '8109' : overrides.room,
    className: 'プログラミング',
    user: {
      encryptedCitCreds:
        overrides.encryptedCitCreds === undefined
          ? Buffer.from('encrypted')
          : overrides.encryptedCitCreds,
      // WHY: confirm 経路では Worker でも mode を再評価 (enqueue 後の mode 変更で
      // stale ジョブが confirm として走るのを防ぐ)。デフォルトは confirm、
      // mode-stale テストで auto/manual に差し替える。
      attendanceSettings:
        overrides.attendanceSettings === undefined
          ? { mode: 'confirm' }
          : overrides.attendanceSettings,
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

// 1 限 9:00 開始 - 5 分 = 8:55 がターゲット (月曜) — JST 固定で TZ 非依存
// WHY: guard は Asia/Tokyo で評価する。テスト側もコンテナ TZ (CI=UTC) に依らない
// よう JST 明示で system time を固定する。
const IN_WINDOW = new Date('2026-05-04T08:55:00+09:00');

beforeEach(() => {
  vi.clearAllMocks();
  attendanceLogUpdateMany.mockResolvedValue({ count: 0 });
  attendanceLogCreate.mockResolvedValue({});
  attendanceLogFindFirst.mockResolvedValue(null);
  attendanceAuditLogCreate.mockResolvedValue({});
  vi.useFakeTimers();
  vi.setSystemTime(IN_WINDOW);
});

afterEach(() => {
  vi.useRealTimers();
});

afterAll(() => {
  vi.useRealTimers();
});

describe('processAttendanceJob — method=confirm 成功パス', () => {
  it('confirm-guard 全条件 OK で adapter.attend が呼ばれる', async () => {
    timetableFindUnique.mockResolvedValue(timetableRow());
    const adapter = makeAdapter();

    await processAttendanceJob({ id: 'c1', data: confirmJobData() }, adapter);

    expect(adapter.healthCheck).toHaveBeenCalledTimes(1);
    expect(adapter.attend).toHaveBeenCalledTimes(1);
    expect(adapter.attend).toHaveBeenCalledWith('cit-id', 'cit-pw', '8109');
  });

  it('ATTENDANCE_AUTO_DRY_RUN=true でも confirm は実送信する (dry-run は auto 専用)', async () => {
    // WHY: dry-run は auto 専用の安全弁。confirm はユーザ起点なので常に実送信する。
    process.env.ATTENDANCE_AUTO_DRY_RUN = 'true';
    try {
      timetableFindUnique.mockResolvedValue(timetableRow());
      const adapter = makeAdapter();
      await processAttendanceJob({ id: 'c-dry', data: confirmJobData() }, adapter);
      expect(adapter.attend).toHaveBeenCalledTimes(1);
    } finally {
      delete process.env.ATTENDANCE_AUTO_DRY_RUN;
    }
  });

  it('成功時に pre_attempt → post_attempt の 2 監査ログ + AttendanceLog success が記録される', async () => {
    timetableFindUnique.mockResolvedValue(timetableRow());
    const adapter = makeAdapter();

    await processAttendanceJob({ id: 'c2', data: confirmJobData() }, adapter);

    const phases = attendanceAuditLogCreate.mock.calls
      .map((c) => (c[0] as { data: { phase: string } }).data.phase);
    expect(phases).toContain('pre_attempt');
    expect(phases).toContain('post_attempt');

    const postAttempt = attendanceAuditLogCreate.mock.calls.find(
      (c) => (c[0] as { data: { phase: string } }).data.phase === 'post_attempt'
    );
    expect((postAttempt![0] as { data: { outcome: string } }).data.outcome).toBe('success');

    // AttendanceLog にも success が書かれる
    const successWrite = attendanceLogCreate.mock.calls.find(
      (c) => (c[0] as { data: { status: string } }).data.status === 'success'
    );
    expect(successWrite).toBeDefined();
    expect((successWrite![0] as { data: { method: string } }).data.method).toBe('confirm');
  });

  // WHY: 遅延ジョブが Worker 実行時に new Date() で classDate を再計算すると、
  // ユーザが確認した日と別日の出席を送ってしまう (replay protection が機能しない)。
  // payload の classDate を尊重することを、existingSuccess 検索の where 引数で
  // 確認する (実行時刻 ≠ payload 日付に固定しても、payload 日付で照会される)。
  it('payload の classDate が DB 検索 / AttendanceLog 書き込みに使われる (実行時刻ではなく)', async () => {
    timetableFindUnique.mockResolvedValue(timetableRow());
    const adapter = makeAdapter();

    // 実行時刻は in-window の月曜 9:25 だが、payload はその同じ日を ISO 文字列で
    // 明示する。assert は「Worker 内で payload を読んで Date に戻している」こと。
    const PAYLOAD_DATE = '2026-05-04';
    await processAttendanceJob(
      { id: 'c-cd', data: { ...confirmJobData(), classDate: PAYLOAD_DATE } },
      adapter
    );

    // 1) existingSuccess 検索の where.classDate が payload 由来
    // WHY: toISOString() を使うと UTC 変換で前日にズレる (JST 環境)。
    // ローカルカレンダーの年/月/日で比較する。
    expect(attendanceLogFindFirst).toHaveBeenCalledTimes(1);
    const findWhere = (attendanceLogFindFirst.mock.calls[0][0] as {
      where: { classDate: Date };
    }).where;
    expect(localDateString(findWhere.classDate)).toBe(PAYLOAD_DATE);

    // 2) AttendanceLog success の classDate も payload 由来
    const successWrite = attendanceLogCreate.mock.calls.find(
      (c) => (c[0] as { data: { status: string } }).data.status === 'success'
    );
    expect(successWrite).toBeDefined();
    const writtenDate = (successWrite![0] as { data: { classDate: Date } }).data.classDate;
    expect(localDateString(writtenDate)).toBe(PAYLOAD_DATE);
  });
});

function localDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

describe('processAttendanceJob — method=confirm guard reject', () => {
  it('room mismatch (PR #15 残リスク対応) で adapter は呼ばれない', async () => {
    // WHY: PR #15 Codex 指摘の「QR の教室コードと時間割の教室が不一致なら
    // サーバー側でも送信不可」を Worker 入口でも確実に拒否する
    timetableFindUnique.mockResolvedValue(timetableRow({ room: '0000' }));
    const adapter = makeAdapter();

    await processAttendanceJob({ id: 'c3', data: confirmJobData() }, adapter);

    expect(adapter.healthCheck).not.toHaveBeenCalled();
    expect(adapter.attend).not.toHaveBeenCalled();
  });

  it('timetable 所有者違いで adapter は呼ばれない', async () => {
    timetableFindUnique.mockResolvedValue(timetableRow({ userId: 'attacker' }));
    const adapter = makeAdapter();

    await processAttendanceJob({ id: 'c4', data: confirmJobData() }, adapter);

    expect(adapter.healthCheck).not.toHaveBeenCalled();
    expect(adapter.attend).not.toHaveBeenCalled();
  });

  it('時刻ウィンドウ外 (9:22) で adapter は呼ばれない', async () => {
    vi.setSystemTime(new Date('2026-05-04T08:52:00+09:00'));
    timetableFindUnique.mockResolvedValue(timetableRow());
    const adapter = makeAdapter();

    await processAttendanceJob({ id: 'c5', data: confirmJobData() }, adapter);

    expect(adapter.healthCheck).not.toHaveBeenCalled();
    expect(adapter.attend).not.toHaveBeenCalled();
  });

  it('同日 confirm 重複 (existingSuccess あり) で adapter は呼ばれない', async () => {
    timetableFindUnique.mockResolvedValue(timetableRow());
    attendanceLogFindFirst.mockResolvedValue({ id: 'log-1', status: 'success' });
    const adapter = makeAdapter();

    await processAttendanceJob({ id: 'c6', data: confirmJobData() }, adapter);

    expect(adapter.healthCheck).not.toHaveBeenCalled();
    expect(adapter.attend).not.toHaveBeenCalled();
  });

  it('認証情報未登録で adapter は呼ばれない (confirm-guard で reject)', async () => {
    timetableFindUnique.mockResolvedValue(timetableRow({ encryptedCitCreds: null }));
    const adapter = makeAdapter();

    await processAttendanceJob({ id: 'c7', data: confirmJobData() }, adapter);

    expect(adapter.healthCheck).not.toHaveBeenCalled();
    expect(adapter.attend).not.toHaveBeenCalled();
  });

  // WHY: API で mode='confirm' をチェックしても、enqueue 後にユーザが mode を
  // 切替えると stale ジョブが confirm 経路で走り続ける。Worker 入口でも
  // attendanceSettings.mode を再評価して skip する (Codex 指摘)。
  it('mode が auto に切替えられていれば confirm ジョブは adapter を呼ばずに skip', async () => {
    timetableFindUnique.mockResolvedValue(
      timetableRow({ attendanceSettings: { mode: 'auto' } })
    );
    const adapter = makeAdapter();

    await processAttendanceJob({ id: 'c-mode-stale', data: confirmJobData() }, adapter);

    expect(adapter.healthCheck).not.toHaveBeenCalled();
    expect(adapter.attend).not.toHaveBeenCalled();
    // 監査ログに skip 理由が残る
    const skippedAudit = attendanceAuditLogCreate.mock.calls.find(
      (c) => (c[0] as { data: { reason: string | null } }).data.reason === 'not_in_confirm_mode'
    );
    expect(skippedAudit).toBeDefined();
  });

  it('mode が manual に切替えられていれば confirm ジョブは skip', async () => {
    timetableFindUnique.mockResolvedValue(
      timetableRow({ attendanceSettings: { mode: 'manual' } })
    );
    const adapter = makeAdapter();

    await processAttendanceJob({ id: 'c-mode-manual', data: confirmJobData() }, adapter);

    expect(adapter.healthCheck).not.toHaveBeenCalled();
    expect(adapter.attend).not.toHaveBeenCalled();
  });

  it('healthCheck 失敗 (campus 到達不可) で adapter.attend は呼ばれない', async () => {
    // WHY: healthCheck で 1 度外部アクセスは発生するが、attend には進まない
    timetableFindUnique.mockResolvedValue(timetableRow());
    const adapter = makeAdapter();
    adapter.healthCheck.mockResolvedValue(false);

    await processAttendanceJob({ id: 'c8', data: confirmJobData() }, adapter);

    expect(adapter.healthCheck).toHaveBeenCalledTimes(1);
    expect(adapter.attend).not.toHaveBeenCalled();
  });

  it('reject 時に AttendanceAuditLog に phase=skipped + reason が記録される', async () => {
    timetableFindUnique.mockResolvedValue(timetableRow({ room: '0000' }));
    const adapter = makeAdapter();

    await processAttendanceJob({ id: 'c9', data: confirmJobData() }, adapter);

    const skipped = attendanceAuditLogCreate.mock.calls.find(
      (c) => (c[0] as { data: { phase: string } }).data.phase === 'skipped'
    );
    expect(skipped).toBeDefined();
    expect((skipped![0] as { data: { method: string; reason: string } }).data.method).toBe('confirm');
    expect((skipped![0] as { data: { reason: string } }).data.reason).toContain('room_mismatch');
  });

  // WHY: adapter.attend が例外を throw した場合も、UI は「結果は通知でお知らせします」
  // を表示してジョブ完了を待っている。throw だけで saveLog/notifyUser を通らない
  // と、出席履歴に何も残らず通知も来ない (Codex 指摘)。catch 内で failed ログ +
  // notify を保証してから re-throw する。
  it('adapter.attend が throw しても AttendanceLog の failed と notifyUser は通る', async () => {
    timetableFindUnique.mockResolvedValue(timetableRow());
    const adapter = makeAdapter();
    adapter.attend.mockRejectedValue(new Error('network timeout'));

    await expect(
      processAttendanceJob({ id: 'c-throw', data: confirmJobData() }, adapter)
    ).rejects.toThrow('network timeout');

    // AttendanceLog に failed が書かれる
    const failedWrite = attendanceLogCreate.mock.calls.find(
      (c) => (c[0] as { data: { status: string } }).data.status === 'failed'
    );
    expect(failedWrite).toBeDefined();
    // ユーザ通知も呼ばれる (push notification キュー add)
    expect(notifyAdd).toHaveBeenCalled();
  });
});
