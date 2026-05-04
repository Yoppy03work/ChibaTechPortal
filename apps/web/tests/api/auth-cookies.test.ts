/**
 * auth-cookies の refresh token cookie clear リスト検証
 *
 * WHY: 本番デプロイで __Host-refresh_token に切り替えた直後、クライアントには
 * 旧 refresh_token cookie が残ることがある。signOut / refresh の clear 経路では
 * 新旧両方を必ず clear する必要があり、その対象リストが NODE_ENV により
 * 正しく切り替わることを固定する。
 */
import { describe, it, expect, afterEach, vi } from 'vitest';

describe('refreshTokenCookieNamesToClear', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    vi.resetModules();
  });

  it('development では legacy 名 (refresh_token) のみを clear 対象にする', async () => {
    process.env.NODE_ENV = 'development';
    vi.resetModules();
    const mod = await import('@/lib/auth-cookies');

    expect([...mod.refreshTokenCookieNamesToClear()]).toEqual(['refresh_token']);
  });

  it('production では新旧 (__Host-refresh_token + refresh_token) 両方を clear 対象にする', async () => {
    process.env.NODE_ENV = 'production';
    vi.resetModules();
    const mod = await import('@/lib/auth-cookies');

    // WHY: 順序固定（新名が先）。signOut / refresh の for-of ループでは順序に
    // 意味はないが、リグレッション検出のために配列内容を厳密に比較する。
    expect([...mod.refreshTokenCookieNamesToClear()]).toEqual([
      '__Host-refresh_token',
      'refresh_token',
    ]);
  });
});
