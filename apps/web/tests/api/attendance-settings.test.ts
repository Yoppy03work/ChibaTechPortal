/**
 * /api/attendance/settings の単体テスト
 *
 * WHY: GET で旧形式 → 新形式の正規化、PUT で zod 検証＋mode 保存の挙動を
 * 経路で押さえる。auth と prisma をモックして handler を直叩きする。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const authMock = vi.fn();
vi.mock('@/lib/auth', () => ({
  auth: () => authMock(),
}));

const findUnique = vi.fn();
const update = vi.fn();
vi.mock('@chibatech/db', () => ({
  prisma: {
    user: {
      findUnique: (...args: unknown[]) => findUnique(...args),
      update: (...args: unknown[]) => update(...args),
    },
  },
}));

import { GET, PUT } from '@/app/api/attendance/settings/route';

function makeReq(body: unknown): Request {
  return new Request('http://localhost/api/attendance/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('GET /api/attendance/settings', () => {
  beforeEach(() => {
    authMock.mockReset();
    findUnique.mockReset();
    update.mockReset();
  });

  it('未認証なら 401', async () => {
    authMock.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('新形式 { mode } をそのまま返す', async () => {
    authMock.mockResolvedValue({ user: { id: 'user-1' } });
    findUnique.mockResolvedValue({ attendanceSettings: { mode: 'manual' } });
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ mode: 'manual' });
  });

  it('旧形式 { autoAttend: true } → { mode: "confirm" } (auto に昇格させない)', async () => {
    // WHY: 旧 UI の「自動出席 ON」を新 mode='auto' へ暗黙昇格させない。
    // auto は 6 条件ガード前提で旧 boolean とは別物なので、安全側 (confirm) に倒す
    authMock.mockResolvedValue({ user: { id: 'user-1' } });
    findUnique.mockResolvedValue({ attendanceSettings: { autoAttend: true } });
    const res = await GET();
    expect(await res.json()).toEqual({ mode: 'confirm' });
  });

  it('旧形式 { autoAttend: false } → { mode: "confirm" }', async () => {
    authMock.mockResolvedValue({ user: { id: 'user-1' } });
    findUnique.mockResolvedValue({ attendanceSettings: { autoAttend: false } });
    const res = await GET();
    expect(await res.json()).toEqual({ mode: 'confirm' });
  });

  it('null 行 → デフォルト { mode: "confirm" }', async () => {
    authMock.mockResolvedValue({ user: { id: 'user-1' } });
    findUnique.mockResolvedValue({ attendanceSettings: null });
    const res = await GET();
    expect(await res.json()).toEqual({ mode: 'confirm' });
  });

  it('user 未取得（null）→ デフォルト', async () => {
    authMock.mockResolvedValue({ user: { id: 'user-1' } });
    findUnique.mockResolvedValue(null);
    const res = await GET();
    expect(await res.json()).toEqual({ mode: 'confirm' });
  });
});

describe('PUT /api/attendance/settings', () => {
  beforeEach(() => {
    authMock.mockReset();
    findUnique.mockReset();
    update.mockReset();
  });

  it('未認証なら 401', async () => {
    authMock.mockResolvedValue(null);
    const res = await PUT(makeReq({ mode: 'manual' }));
    expect(res.status).toBe(401);
    expect(update).not.toHaveBeenCalled();
  });

  it('JSON でない → 400', async () => {
    authMock.mockResolvedValue({ user: { id: 'user-1' } });
    const req = new Request('http://localhost/api/attendance/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: 'not-json{',
    });
    const res = await PUT(req);
    expect(res.status).toBe(400);
    expect(update).not.toHaveBeenCalled();
  });

  it.each(['manual', 'confirm', 'auto'] as const)('mode=%s を保存', async (mode) => {
    authMock.mockResolvedValue({ user: { id: 'user-1' } });
    update.mockResolvedValue({});
    const res = await PUT(makeReq({ mode }));
    expect(res.status).toBe(200);
    expect(update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { attendanceSettings: { mode } },
    });
  });

  it('未知の mode → 400 + 保存しない', async () => {
    authMock.mockResolvedValue({ user: { id: 'user-1' } });
    const res = await PUT(makeReq({ mode: 'unknown' }));
    expect(res.status).toBe(400);
    expect(update).not.toHaveBeenCalled();
  });

  it('旧形式 { autoAttend } は受け付けない（PUT は新形式のみ）', async () => {
    // WHY: 互換は GET 側（read path）でだけ吸収する。PUT で旧形式を許すと
    // クライアント実装がいつまでも旧形式を送り続ける温床になる。
    authMock.mockResolvedValue({ user: { id: 'user-1' } });
    const res = await PUT(makeReq({ autoAttend: true }));
    expect(res.status).toBe(400);
    expect(update).not.toHaveBeenCalled();
  });

  it('mode 欠如 → 400', async () => {
    authMock.mockResolvedValue({ user: { id: 'user-1' } });
    const res = await PUT(makeReq({}));
    expect(res.status).toBe(400);
    expect(update).not.toHaveBeenCalled();
  });
});
