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

import { POST } from '@/app/api/attendance/submit/route';

// 1 限 9:30 開始 - 5 分 = 9:25 がターゲット (月曜)
const IN_WINDOW = new Date(2026, 4, 4, 9, 25, 0);
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
}> = {}) {
  return {
    id: 'tt-1',
    userId: overrides.userId ?? 'user-1',
    dayOfWeek: 1,
    period: 1,
    room: overrides.room === undefined ? '8109' : overrides.room,
    user: {
      encryptedCitCreds:
        overrides.encryptedCitCreds === undefined
          ? Buffer.from('encrypted')
          : overrides.encryptedCitCreds,
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  authMock.mockReset();
  timetableFindUnique.mockReset();
  attendanceLogFindFirst.mockReset();
  queueAdd.mockReset();
  attendanceLogFindFirst.mockResolvedValue(null);
  queueAdd.mockResolvedValue({});
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
    vi.setSystemTime(new Date(2026, 4, 4, 9, 22, 0));
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
    });
    // jobId で同日同 timetable を一意化 (二重 enqueue 防止)
    expect(opts.jobId).toContain('confirm:user-1:tt-1:');
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
