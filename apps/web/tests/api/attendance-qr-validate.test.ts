/**
 * POST /api/attendance/qr-validate の単体テスト
 *
 * WHY: QR セッション検証エンドポイント。ownership/room/date/時刻ウィンドウを confirm と
 * 同じ guard で検証し、通れば AttendanceQrSession を upsert する。各 reject と rate-limit、
 * 成功時の upsert を固定する。外部 HTTP は出ない。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const authMock = vi.fn();
vi.mock('@/lib/auth', () => ({ auth: () => authMock() }));

const timetableFindUnique = vi.fn();
const qrSessionUpsert = vi.fn();
vi.mock('@chibatech/db', () => ({
  prisma: {
    timetable: { findUnique: (...a: unknown[]) => timetableFindUnique(...a) },
    attendanceQrSession: { upsert: (...a: unknown[]) => qrSessionUpsert(...a) },
  },
}));

const rateLimiterCheck = vi.fn();
vi.mock('@/lib/rate-limiter', () => ({
  rateLimiter: { check: (...a: unknown[]) => rateLimiterCheck(...a) },
}));

import { POST } from '@/app/api/attendance/qr-validate/route';

const IN_WINDOW = new Date('2026-05-04T08:55:00+09:00'); // 月曜 1限(9:00) -5分
const TODAY_ISO = '2026-05-04';

function makeReq(body: unknown): Request {
  return new Request('http://localhost/api/attendance/qr-validate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Sec-Fetch-Site': 'same-origin' },
    body: JSON.stringify(body),
  });
}

function validBody() {
  return { timetableId: 'tt-1', roomId: '8109', classDate: TODAY_ISO };
}

function timetableRow(overrides: Partial<{ userId: string; room: string | null }> = {}) {
  return {
    id: 'tt-1',
    userId: overrides.userId ?? 'user-1',
    dayOfWeek: 1,
    period: 1,
    room: overrides.room === undefined ? '8109' : overrides.room,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  authMock.mockReset();
  timetableFindUnique.mockReset();
  qrSessionUpsert.mockReset();
  rateLimiterCheck.mockReset();
  qrSessionUpsert.mockResolvedValue({});
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

describe('POST /api/attendance/qr-validate', () => {
  it('未認証なら 401', async () => {
    authMock.mockResolvedValue(null);
    const res = await POST(makeReq(validBody()));
    expect(res.status).toBe(401);
    expect(qrSessionUpsert).not.toHaveBeenCalled();
  });

  it('全条件 OK で 200 + session upsert', async () => {
    authMock.mockResolvedValue({ user: { id: 'user-1' } });
    timetableFindUnique.mockResolvedValue(timetableRow());
    const res = await POST(makeReq(validBody()));
    expect(res.status).toBe(200);
    expect(qrSessionUpsert).toHaveBeenCalledTimes(1);
    const arg = qrSessionUpsert.mock.calls[0][0] as {
      where: { userId_roomId_classDate: { userId: string; roomId: string } };
    };
    expect(arg.where.userId_roomId_classDate).toMatchObject({
      userId: 'user-1',
      roomId: '8109',
    });
  });

  it('他人の timetable で 400 + timetable_not_owned (session を作らない)', async () => {
    authMock.mockResolvedValue({ user: { id: 'user-1' } });
    timetableFindUnique.mockResolvedValue(timetableRow({ userId: 'attacker' }));
    const res = await POST(makeReq(validBody()));
    expect(res.status).toBe(400);
    expect((await res.json()).reason).toBe('timetable_not_owned');
    expect(qrSessionUpsert).not.toHaveBeenCalled();
  });

  it('room mismatch で 400 + room_mismatch', async () => {
    authMock.mockResolvedValue({ user: { id: 'user-1' } });
    timetableFindUnique.mockResolvedValue(timetableRow({ room: '0000' }));
    const res = await POST(makeReq(validBody()));
    expect(res.status).toBe(400);
    expect((await res.json()).reason).toBe('room_mismatch');
  });

  it('時刻ウィンドウ外で 400 + outside_time_window', async () => {
    authMock.mockResolvedValue({ user: { id: 'user-1' } });
    timetableFindUnique.mockResolvedValue(timetableRow());
    vi.setSystemTime(new Date('2026-05-04T10:30:00+09:00'));
    const res = await POST(makeReq(validBody()));
    expect(res.status).toBe(400);
    expect((await res.json()).reason).toBe('outside_time_window');
  });

  it('rate limit 超過で 429 (session を作らない)', async () => {
    authMock.mockResolvedValue({ user: { id: 'user-1' } });
    rateLimiterCheck.mockResolvedValue({
      allowed: false,
      remaining: 0,
      resetAt: new Date(Date.now() + 60 * 1000),
    });
    const res = await POST(makeReq(validBody()));
    expect(res.status).toBe(429);
    expect(qrSessionUpsert).not.toHaveBeenCalled();
  });
});
