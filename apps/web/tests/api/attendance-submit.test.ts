/**
 * POST /api/attendance/submit の単体テスト
 *
 * WHY: confirm モードの送信エンドポイント。フロント検証バイパス耐性を
 * 持たせるため、サーバー側で confirm-guard を再実行している。各 reject 経路と
 * 成功時の BullMQ 投入挙動を固定する。
 *
 * 外部システムへの実 HTTP は本ハンドラからは出ない (Queue.add のみ) ことも
 * テストで担保する。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// auth と prisma を mock
const authMock = vi.fn();
vi.mock('@/lib/auth', () => ({
  auth: () => authMock(),
}));

const timetableFindUnique = vi.fn();
const attendanceLogFindFirst = vi.fn();
vi.mock('@chibatech/db', () => ({
  prisma: {
    timetable: {
      findUnique: (...args: unknown[]) => timetableFindUnique(...args),
    },
    attendanceLog: {
      findFirst: (...args: unknown[]) => attendanceLogFindFirst(...args),
    },
  },
}));

// attendanceQueue は BullMQ + Redis を実起動するので mock
const queueAdd = vi.fn();
vi.mock('@/lib/attendance-queue', () => ({
  attendanceQueue: {
    add: (...args: unknown[]) => queueAdd(...args),
  },
}));

// rateLimiter は Redis 接続を持つので mock。テスト個別に挙動を差し替える
const rateLimiterCheck = vi.fn();
vi.mock('@/lib/rate-limiter', () => ({
  rateLimiter: {
    check: (...args: unknown[]) => rateLimiterCheck(...args),
  },
}));

import { POST } from '@/app/api/attendance/submit/route';

// 1 限 9:00 開始 - 5 分 = 8:55 がターゲット (月曜) — JST 固定で TZ 非依存
// WHY: confirm-guard は Asia/Tokyo で評価する。テスト側もコンテナ TZ (CI=UTC) に
// 依らないよう JST 明示で system time を固定する。
const IN_WINDOW = new Date('2026-05-04T08:55:00+09:00');
const TODAY_ISO = '2026-05-04';

function makeReq(body: unknown): Request {
  // WHY: same-origin 想定。Origin ヘッダ無しは validateStateChangingRequest で
  // 許可される (Origin allowlist は cross-site 検出が主用途で、null は
  // same-origin GET/POST として通過させる設計)。cross-site / 不正 Origin の
  // 拒否挙動は別途 api-guard.test.ts で網羅済み。
  return new Request('http://localhost/api/attendance/submit', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Sec-Fetch-Site': 'same-origin',
    },
    body: JSON.stringify(body),
  });
}

function validBody() {
  return {
    timetableId: 'tt-1',
    roomId: '8109',
    classDate: TODAY_ISO,
  };
}

function timetableRow(overrides: Partial<{
  userId: string;
  room: string | null;
  encryptedCitCreds: Buffer | null;
  className: string;
  attendanceSettings: unknown;
}> = {}) {
  return {
    id: 'tt-1',
    userId: overrides.userId ?? 'user-1',
    dayOfWeek: 1,
    period: 1,
    room: overrides.room === undefined ? '8109' : overrides.room,
    className: overrides.className ?? 'プログラミング',
    user: {
      encryptedCitCreds:
        overrides.encryptedCitCreds === undefined
          ? Buffer.from('encrypted')
          : overrides.encryptedCitCreds,
      // WHY: API は mode='confirm' でないと弾く (mode gate)。
      // デフォルトは confirm 想定、mode-gate テストでだけ別 mode に差し替える。
      attendanceSettings:
        overrides.attendanceSettings === undefined
          ? { mode: 'confirm' }
          : overrides.attendanceSettings,
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  authMock.mockReset();
  timetableFindUnique.mockReset();
  attendanceLogFindFirst.mockReset();
  queueAdd.mockReset();
  rateLimiterCheck.mockReset();
  attendanceLogFindFirst.mockResolvedValue(null);
  queueAdd.mockResolvedValue({});
  // WHY: デフォルトは「許可」。rate-limit テストでだけ throttled を返す
  rateLimiterCheck.mockResolvedValue({
    allowed: true,
    remaining: 9,
    resetAt: new Date(Date.now() + 10 * 60 * 1000),
  });
  vi.useFakeTimers();
  vi.setSystemTime(IN_WINDOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('POST /api/attendance/submit — 認証 / 入力検証', () => {
  it('未認証なら 401', async () => {
    authMock.mockResolvedValue(null);
    const res = await POST(makeReq(validBody()));
    expect(res.status).toBe(401);
    expect(queueAdd).not.toHaveBeenCalled();
  });

  it('JSON でない body は 400', async () => {
    authMock.mockResolvedValue({ user: { id: 'user-1' } });
    const req = new Request('http://localhost/api/attendance/submit', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Sec-Fetch-Site': 'same-origin',
      },
      body: 'not-json{',
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(queueAdd).not.toHaveBeenCalled();
  });

  it('roomId 形式不正で 400', async () => {
    authMock.mockResolvedValue({ user: { id: 'user-1' } });
    const res = await POST(makeReq({ ...validBody(), roomId: '8109 ext' }));
    expect(res.status).toBe(400);
    expect(queueAdd).not.toHaveBeenCalled();
  });

  it('Content-Type が JSON でないと 415', async () => {
    authMock.mockResolvedValue({ user: { id: 'user-1' } });
    const req = new Request('http://localhost/api/attendance/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify(validBody()),
    });
    const res = await POST(req);
    expect(res.status).toBe(415);
    expect(queueAdd).not.toHaveBeenCalled();
  });

  it('cross-site Origin は 403', async () => {
    authMock.mockResolvedValue({ user: { id: 'user-1' } });
    const req = new Request('http://localhost/api/attendance/submit', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Sec-Fetch-Site': 'cross-site',
      },
      body: JSON.stringify(validBody()),
    });
    const res = await POST(req);
    expect(res.status).toBe(403);
    expect(queueAdd).not.toHaveBeenCalled();
  });
});

describe('POST /api/attendance/submit — guard reject', () => {
  it('timetable 不在で 400 (情報を返さない)', async () => {
    authMock.mockResolvedValue({ user: { id: 'user-1' } });
    timetableFindUnique.mockResolvedValue(null);
    const res = await POST(makeReq(validBody()));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Invalid timetable');
    expect(queueAdd).not.toHaveBeenCalled();
  });

  // WHY: フロントは ConfirmFlow を mode≠confirm では hide するだけ。curl 直叩きで
  // auto/manual ユーザの confirm 経路が起動する穴を、サーバ側で塞ぐ (Codex P2 指摘)。
  it('mode が confirm でなければ 400 + reason=not_in_confirm_mode', async () => {
    authMock.mockResolvedValue({ user: { id: 'user-1' } });
    timetableFindUnique.mockResolvedValue(
      timetableRow({ attendanceSettings: { mode: 'auto' } })
    );
    const res = await POST(makeReq(validBody()));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('submit_blocked');
    expect(body.reason).toBe('not_in_confirm_mode');
    expect(queueAdd).not.toHaveBeenCalled();
  });

  it('mode が manual でも 400 + reason=not_in_confirm_mode', async () => {
    authMock.mockResolvedValue({ user: { id: 'user-1' } });
    timetableFindUnique.mockResolvedValue(
      timetableRow({ attendanceSettings: { mode: 'manual' } })
    );
    const res = await POST(makeReq(validBody()));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.reason).toBe('not_in_confirm_mode');
    expect(queueAdd).not.toHaveBeenCalled();
  });

  it('room mismatch (PR #15 残リスク) で 400 + reason=room_mismatch', async () => {
    // WHY: PR #15 Codex 指摘の「サーバー側でも送信不可にする必要」を満たす
    authMock.mockResolvedValue({ user: { id: 'user-1' } });
    timetableFindUnique.mockResolvedValue(timetableRow({ room: '0000' }));
    const res = await POST(makeReq(validBody()));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('submit_blocked');
    expect(body.reason).toBe('room_mismatch');
    expect(queueAdd).not.toHaveBeenCalled();
  });

  it('他人の timetable で 400 + reason=timetable_not_owned', async () => {
    authMock.mockResolvedValue({ user: { id: 'user-1' } });
    timetableFindUnique.mockResolvedValue(timetableRow({ userId: 'attacker' }));
    const res = await POST(makeReq(validBody()));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.reason).toBe('timetable_not_owned');
    expect(queueAdd).not.toHaveBeenCalled();
  });

  it('非所有 timetable は owner の mode によらず timetable_not_owned を返す (mode 漏洩防止・順序固定)', async () => {
    // WHY: route は ownership(guard) を mode-gate より先に判定する。これにより
    // 攻撃者が他人の timetableId を POST しても、被害者の attendanceSettings.mode
    // (auto/manual/confirm) を応答コードの差分から推定できない。
    // mode-check を guard より前に動かすリファクタが入ると、非所有かつ非 confirm の
    // owner に対して not_in_confirm_mode が漏れる。このテストはその順序を pin する。
    // 既存の timetable_not_owned テストは owner が default の confirm モードのため、
    // mode を先に評価しても結果が変わらず順序回帰を検出できない点を補完する。
    authMock.mockResolvedValue({ user: { id: 'user-1' } });
    timetableFindUnique.mockResolvedValue(
      timetableRow({ userId: 'attacker', attendanceSettings: { mode: 'auto' } })
    );
    const res = await POST(makeReq(validBody()));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.reason).toBe('timetable_not_owned');
    // owner が auto モードであることを漏らさない (mode-gate より ownership が先)
    expect(body.reason).not.toBe('not_in_confirm_mode');
    expect(queueAdd).not.toHaveBeenCalled();
  });

  it('同日 confirm 重複ありで 400 + reason=already_submitted', async () => {
    authMock.mockResolvedValue({ user: { id: 'user-1' } });
    timetableFindUnique.mockResolvedValue(timetableRow());
    attendanceLogFindFirst.mockResolvedValue({ id: 'log-1' });
    const res = await POST(makeReq(validBody()));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.reason).toBe('already_submitted');
    expect(queueAdd).not.toHaveBeenCalled();
  });

  it('認証情報未登録で 400 + reason=credentials_not_registered', async () => {
    authMock.mockResolvedValue({ user: { id: 'user-1' } });
    timetableFindUnique.mockResolvedValue(timetableRow({ encryptedCitCreds: null }));
    const res = await POST(makeReq(validBody()));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.reason).toBe('credentials_not_registered');
    expect(queueAdd).not.toHaveBeenCalled();
  });

  it('時刻ウィンドウ外で 400 + reason=outside_time_window', async () => {
    vi.setSystemTime(new Date('2026-05-04T08:52:00+09:00'));
    authMock.mockResolvedValue({ user: { id: 'user-1' } });
    timetableFindUnique.mockResolvedValue(timetableRow());
    const res = await POST(makeReq(validBody()));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.reason).toBe('outside_time_window');
    expect(queueAdd).not.toHaveBeenCalled();
  });

  it('classDate が今日と違うと 400 + reason=class_date_mismatch', async () => {
    authMock.mockResolvedValue({ user: { id: 'user-1' } });
    timetableFindUnique.mockResolvedValue(timetableRow());
    const res = await POST(makeReq({ ...validBody(), classDate: '2026-05-03' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.reason).toBe('class_date_mismatch');
    expect(queueAdd).not.toHaveBeenCalled();
  });
});

describe('POST /api/attendance/submit — 成功パス', () => {
  it('全条件 OK で 202 + attendanceQueue.add 呼び出し (method=confirm)', async () => {
    authMock.mockResolvedValue({ user: { id: 'user-1' } });
    timetableFindUnique.mockResolvedValue(timetableRow());

    const res = await POST(makeReq(validBody()));

    expect(res.status).toBe(202);
    const body = await res.json();
    expect(body.accepted).toBe(true);
    expect(typeof body.jobId).toBe('string');

    expect(queueAdd).toHaveBeenCalledTimes(1);
    const [jobName, jobData, opts] = queueAdd.mock.calls[0];
    expect(jobName).toBe('attend');
    expect(jobData).toMatchObject({
      userId: 'user-1',
      timetableId: 'tt-1',
      roomId: '8109',
      method: 'confirm',
      // WHY: Worker 入口の zod (className.min(1)) を通すため timetable 実値が
      // payload に必要。空文字だと全 confirm ジョブが parse 段階で死ぬ回帰を防ぐ。
      className: 'プログラミング',
      // WHY: ユーザが UI で確認した日。Worker が new Date() で再計算すると
      // 遅延ジョブで別日の出席を送るため、payload で運ぶ必要がある。
      classDate: TODAY_ISO,
    });
    // jobId で同日同 timetable を一意化 (二重 enqueue 防止)
    // WHY: BullMQ の内部 Redis キーが `bull:<queue>:<jobId>` 形式で `:` を
    // セパレータに使うため、custom jobId は `-` で構成する。
    expect(opts.jobId).toBe(`confirm-user-1-tt-1-${TODAY_ISO}`);
    // WHY: 失敗ジョブが残ると同 jobId の再試行が silently 弾かれるため、
    // removeOnFail は即時 (true) にしてユーザの retry を可能にする。
    expect(opts.removeOnFail).toBe(true);
  });

  it('成功時に外部 HTTP は発生しない (Queue.add のみ)', async () => {
    // WHY: 本ハンドラは Producer のみ。Worker (apps/worker) が実 attend を行う
    authMock.mockResolvedValue({ user: { id: 'user-1' } });
    timetableFindUnique.mockResolvedValue(timetableRow());
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    await POST(makeReq(validBody()));

    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});

describe('POST /api/attendance/submit — rate limit', () => {
  it('rateLimiter が allowed=false を返すと 429 + Retry-After ヘッダ', async () => {
    // WHY: 認証済みユーザが連打した場合の DoS 緩和。jobId 衝突は実 attend を
    // 一意化するが、ハンドラ自体の DB read + enqueue 負荷は残るためここで弾く。
    authMock.mockResolvedValue({ user: { id: 'user-1' } });
    rateLimiterCheck.mockResolvedValue({
      allowed: false,
      remaining: 0,
      resetAt: new Date(Date.now() + 60_000),
    });

    const res = await POST(makeReq(validBody()));
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toMatch(/^\d+$/);
    // rate-limit で弾かれた場合は timetable も queue も触らない
    expect(timetableFindUnique).not.toHaveBeenCalled();
    expect(queueAdd).not.toHaveBeenCalled();
  });

  it('rateLimiter は認証済みユーザID 単位で呼び出される', async () => {
    authMock.mockResolvedValue({ user: { id: 'user-42' } });
    timetableFindUnique.mockResolvedValue(timetableRow({ userId: 'user-42' }));

    await POST(makeReq(validBody()));

    expect(rateLimiterCheck).toHaveBeenCalledTimes(1);
    const [key, config] = rateLimiterCheck.mock.calls[0];
    expect(key).toBe('attend-submit:user-42');
    // RATE_LIMITS.attendanceSubmit は 10/10min
    expect(config).toMatchObject({ maxRequests: 10, windowSeconds: 10 * 60 });
  });
});
