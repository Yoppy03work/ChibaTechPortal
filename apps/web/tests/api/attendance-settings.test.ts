/**
 * /api/attendance/settings の単体テスト
 *
 * WHY: GET で旧形式 → 新形式 {mode,autoUnlocked,autoConfigured} の正規化、
 * PUT で mode 保存 + auto の開発者コード検証（fail-closed）を経路で押さえる。
 * auth と prisma をモックして handler を直叩きする。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

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
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('未認証なら 401', async () => {
    authMock.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('新形式 { mode } を {mode,autoUnlocked,autoConfigured} で返す (dev code 未設定なら autoConfigured=false)', async () => {
    authMock.mockResolvedValue({ user: { id: 'user-1' } });
    findUnique.mockResolvedValue({ attendanceSettings: { mode: 'manual' } });
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      mode: 'manual',
      autoUnlocked: false,
      autoConfigured: false,
    });
  });

  it('mode=auto + autoUnlocked=true を返す。dev code 設定済みなら autoConfigured=true', async () => {
    vi.stubEnv('ATTENDANCE_AUTO_DEV_CODE', 's3cret');
    authMock.mockResolvedValue({ user: { id: 'user-1' } });
    findUnique.mockResolvedValue({ attendanceSettings: { mode: 'auto', autoUnlocked: true } });
    const res = await GET();
    expect(await res.json()).toEqual({
      mode: 'auto',
      autoUnlocked: true,
      autoConfigured: true,
    });
  });

  it('旧形式 { autoAttend: true } → confirm・未解禁 (auto に昇格させない)', async () => {
    authMock.mockResolvedValue({ user: { id: 'user-1' } });
    findUnique.mockResolvedValue({ attendanceSettings: { autoAttend: true } });
    const res = await GET();
    expect(await res.json()).toEqual({
      mode: 'confirm',
      autoUnlocked: false,
      autoConfigured: false,
    });
  });

  it('null 行 → デフォルト confirm・未解禁', async () => {
    authMock.mockResolvedValue({ user: { id: 'user-1' } });
    findUnique.mockResolvedValue({ attendanceSettings: null });
    const res = await GET();
    expect(await res.json()).toEqual({
      mode: 'confirm',
      autoUnlocked: false,
      autoConfigured: false,
    });
  });

  it('user 未取得（null）→ デフォルト', async () => {
    authMock.mockResolvedValue({ user: { id: 'user-1' } });
    findUnique.mockResolvedValue(null);
    const res = await GET();
    expect(await res.json()).toEqual({
      mode: 'confirm',
      autoUnlocked: false,
      autoConfigured: false,
    });
  });
});

describe('PUT /api/attendance/settings', () => {
  beforeEach(() => {
    authMock.mockReset();
    findUnique.mockReset();
    update.mockReset();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
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

  it.each(['manual', 'confirm'] as const)('mode=%s を autoUnlocked=false で保存', async (mode) => {
    authMock.mockResolvedValue({ user: { id: 'user-1' } });
    update.mockResolvedValue({});
    const res = await PUT(makeReq({ mode }));
    expect(res.status).toBe(200);
    expect(update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { attendanceSettings: { mode, autoUnlocked: false } },
    });
  });

  it('mode=auto は dev code 未設定なら 403 auto_locked + 保存しない (fail-closed)', async () => {
    authMock.mockResolvedValue({ user: { id: 'user-1' } });
    const res = await PUT(makeReq({ mode: 'auto', devCode: 'whatever' }));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('auto_locked');
    expect(update).not.toHaveBeenCalled();
  });

  it('mode=auto は dev code 設定済みでもコード不一致なら 403 bad_dev_code', async () => {
    vi.stubEnv('ATTENDANCE_AUTO_DEV_CODE', 's3cret');
    authMock.mockResolvedValue({ user: { id: 'user-1' } });
    const res = await PUT(makeReq({ mode: 'auto', devCode: 'wrong' }));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('bad_dev_code');
    expect(update).not.toHaveBeenCalled();
  });

  it('mode=auto は dev code 設定済み + devCode 欠如でも 403', async () => {
    vi.stubEnv('ATTENDANCE_AUTO_DEV_CODE', 's3cret');
    authMock.mockResolvedValue({ user: { id: 'user-1' } });
    const res = await PUT(makeReq({ mode: 'auto' }));
    expect(res.status).toBe(403);
    expect(update).not.toHaveBeenCalled();
  });

  it('mode=auto + 正しい dev code なら autoUnlocked=true で保存', async () => {
    vi.stubEnv('ATTENDANCE_AUTO_DEV_CODE', 's3cret');
    authMock.mockResolvedValue({ user: { id: 'user-1' } });
    update.mockResolvedValue({});
    const res = await PUT(makeReq({ mode: 'auto', devCode: 's3cret' }));
    expect(res.status).toBe(200);
    expect(update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { attendanceSettings: { mode: 'auto', autoUnlocked: true } },
    });
  });

  it('未知の mode → 400 + 保存しない', async () => {
    authMock.mockResolvedValue({ user: { id: 'user-1' } });
    const res = await PUT(makeReq({ mode: 'unknown' }));
    expect(res.status).toBe(400);
    expect(update).not.toHaveBeenCalled();
  });

  it('旧形式 { autoAttend } は受け付けない（PUT は mode 必須）', async () => {
    authMock.mockResolvedValue({ user: { id: 'user-1' } });
    const res = await PUT(makeReq({ autoAttend: true }));
    expect(res.status).toBe(400);
    expect(update).not.toHaveBeenCalled();
  });

  it('autoUnlocked を client から直接送っても無視される（auto 以外は false 固定）', async () => {
    // WHY: client が autoUnlocked=true を自己申告しても、mode=confirm なら false 保存。
    authMock.mockResolvedValue({ user: { id: 'user-1' } });
    update.mockResolvedValue({});
    const res = await PUT(makeReq({ mode: 'confirm', autoUnlocked: true }));
    expect(res.status).toBe(200);
    expect(update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { attendanceSettings: { mode: 'confirm', autoUnlocked: false } },
    });
  });

  it('mode 欠如 → 400', async () => {
    authMock.mockResolvedValue({ user: { id: 'user-1' } });
    const res = await PUT(makeReq({}));
    expect(res.status).toBe(400);
    expect(update).not.toHaveBeenCalled();
  });
});
