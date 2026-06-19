/**
 * GET /api/attendance/stats のテスト
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const authMock = vi.fn();
vi.mock('@/lib/auth', () => ({ auth: () => authMock() }));

const attendanceLogFindMany = vi.fn();
vi.mock('@chibatech/db', () => ({
  prisma: {
    attendanceLog: { findMany: (...a: unknown[]) => attendanceLogFindMany(...a) },
  },
}));

import { GET } from '@/app/api/attendance/stats/route';

function req(url = 'http://localhost/api/attendance/stats') {
  return new Request(url);
}

beforeEach(() => {
  vi.clearAllMocks();
  authMock.mockReset();
  attendanceLogFindMany.mockReset();
});

describe('GET /api/attendance/stats', () => {
  it('未認証は 401', async () => {
    authMock.mockResolvedValue(null);
    const res = await GET(req());
    expect(res.status).toBe(401);
  });

  it('集計を返す', async () => {
    authMock.mockResolvedValue({ user: { id: 'u1' } });
    attendanceLogFindMany.mockResolvedValue([
      { status: 'success', method: 'confirm', timetable: { className: 'A' } },
      { status: 'failed', method: 'auto', timetable: { className: 'A' } },
    ]);
    const res = await GET(req());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.summary.total).toBe(2);
    expect(body.summary.success).toBe(1);
    expect(body.summary.successRate).toBeCloseTo(0.5);
    expect(body.summary.byClass).toEqual([{ className: 'A', total: 2, success: 1 }]);
  });

  it('days が範囲外 (>120) なら 400', async () => {
    authMock.mockResolvedValue({ user: { id: 'u1' } });
    const res = await GET(req('http://localhost/api/attendance/stats?days=999'));
    expect(res.status).toBe(400);
  });
});
