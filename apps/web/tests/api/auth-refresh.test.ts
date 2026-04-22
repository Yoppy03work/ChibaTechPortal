/**
 * /api/auth/refresh route handler の単体テスト
 *
 * WHY: store 層のテストだけでは route 側の分岐
 * （status code / cookie clear / revokeFamily 呼び出し）が壊れても検知できない。
 * refreshTokenStore と next/headers を vi.mock して handler を直接呼び出す。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

process.env.REFRESH_TOKEN_PEPPER ??=
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

// --- モック ---

const cookieGet = vi.fn();
vi.mock('next/headers', () => ({
  cookies: () =>
    Promise.resolve({
      get: cookieGet,
    }),
}));

const markUsedAtomically = vi.fn();
const revokeFamily = vi.fn();
const save = vi.fn();
vi.mock('@chibatech/db/src/refresh-token-store', () => ({
  refreshTokenStore: {
    markUsedAtomically: (...args: unknown[]) => markUsedAtomically(...args),
    revokeFamily: (...args: unknown[]) => revokeFamily(...args),
    save: (...args: unknown[]) => save(...args),
  },
}));

// handler は mock より後で import（vi.mock は hoist されるので順序は気にしなくていいが、明示）
import { POST } from '@/app/api/auth/refresh/route';

function parseSetCookie(response: Response): {
  name: string;
  value: string;
  maxAge?: number;
} | null {
  const header = response.headers.get('set-cookie');
  if (!header) return null;
  const [kv, ...attrs] = header.split(';');
  const [name, value] = kv.split('=');
  const maxAgeAttr = attrs.find((a) => a.trim().toLowerCase().startsWith('max-age='));
  const maxAge = maxAgeAttr ? parseInt(maxAgeAttr.split('=')[1], 10) : undefined;
  return { name, value, maxAge };
}

describe('POST /api/auth/refresh', () => {
  beforeEach(() => {
    cookieGet.mockReset();
    markUsedAtomically.mockReset();
    revokeFamily.mockReset();
    save.mockReset();
  });

  it('cookie なし → 401（store は呼ばれない）', async () => {
    cookieGet.mockReturnValue(undefined);

    const response = await POST();

    expect(response.status).toBe(401);
    expect(markUsedAtomically).not.toHaveBeenCalled();
    expect(revokeFamily).not.toHaveBeenCalled();
  });

  it('won → 200 + 新しい cookie を set（maxAge > 0）+ save 呼び出し', async () => {
    cookieGet.mockReturnValue({ value: 'raw-token-123' });
    markUsedAtomically.mockResolvedValue({
      outcome: 'won',
      record: {
        token: 'hash-of-raw-token-123',
        userId: 'user-1',
        family: 'family-abc',
        expiresAt: new Date(Date.now() + 86400_000),
        used: true,
      },
    });

    const response = await POST();

    expect(response.status).toBe(200);
    expect(save).toHaveBeenCalledTimes(1);
    expect(revokeFamily).not.toHaveBeenCalled();

    // 新しいトークンが同 family で保存されている
    const savedRecord = save.mock.calls[0][0];
    expect(savedRecord.family).toBe('family-abc');
    expect(savedRecord.userId).toBe('user-1');
    expect(savedRecord.used).toBe(false);

    // cookie は空ではなく maxAge > 0 で set される
    const cookie = parseSetCookie(response);
    expect(cookie?.name).toBe('refresh_token');
    expect(cookie?.value).toBeTruthy();
    expect(cookie?.value).not.toBe('');
    expect(cookie?.maxAge).toBeGreaterThan(0);
  });

  it('reuse_detected → 403 + revokeFamily 呼び出し + cookie clear', async () => {
    cookieGet.mockReturnValue({ value: 'stolen-raw-token' });
    markUsedAtomically.mockResolvedValue({
      outcome: 'reuse_detected',
      family: 'compromised-family',
    });

    const response = await POST();

    expect(response.status).toBe(403);
    expect(revokeFamily).toHaveBeenCalledTimes(1);
    expect(revokeFamily).toHaveBeenCalledWith('compromised-family');
    expect(save).not.toHaveBeenCalled();

    // cookie クリア（maxAge=0, value 空）
    const cookie = parseSetCookie(response);
    expect(cookie?.name).toBe('refresh_token');
    expect(cookie?.value).toBe('');
    expect(cookie?.maxAge).toBe(0);

    const body = await response.json();
    expect(body.error).toContain('reuse');
  });

  it('expired → 401 + cookie clear + revokeFamily は呼ばれない', async () => {
    cookieGet.mockReturnValue({ value: 'expired-raw-token' });
    markUsedAtomically.mockResolvedValue({ outcome: 'expired' });

    const response = await POST();

    expect(response.status).toBe(401);
    expect(revokeFamily).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();

    const cookie = parseSetCookie(response);
    expect(cookie?.value).toBe('');
    expect(cookie?.maxAge).toBe(0);
  });

  it('not_found → 401 + cookie clear + revokeFamily は呼ばれない', async () => {
    cookieGet.mockReturnValue({ value: 'unknown-raw-token' });
    markUsedAtomically.mockResolvedValue({ outcome: 'not_found' });

    const response = await POST();

    expect(response.status).toBe(401);
    expect(revokeFamily).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();

    const cookie = parseSetCookie(response);
    expect(cookie?.value).toBe('');
    expect(cookie?.maxAge).toBe(0);
  });
});
