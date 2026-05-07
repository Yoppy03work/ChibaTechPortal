/**
 * auth-cookies の refresh token cookie clear リスト検証
 *
 * WHY: 本番デプロイで __Host-refresh_token に切り替えた直後、クライアントには
 * 旧 refresh_token cookie が残ることがある。signOut / refresh の clear 経路では
 * 新旧両方を必ず clear する必要があり、その対象リストが NODE_ENV により
 * 正しく切り替わることを固定する。
 *
 * NODE_ENV は @types/node の型定義で readonly のため、`process.env.NODE_ENV = ...`
 * の直接代入は TS2540 になる。vitest が提供する `vi.stubEnv()` を使うと環境変数を
 * 一時的に上書きでき、`vi.unstubAllEnvs()` で元の値に戻せる。
 */
import { describe, it, expect, afterEach, vi } from 'vitest';

describe('refreshTokenCookieNamesToClear', () => {
  afterEach(() => {
    // WHY: stubEnv で書き換えた env をテストごとに巻き戻し、副作用を残さない。
    // vi.resetModules() は import('@/lib/auth-cookies') の再評価のために必須。
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('development では legacy 名 (refresh_token) のみを clear 対象にする', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.resetModules();
    const mod = await import('@/lib/auth-cookies');

    expect([...mod.refreshTokenCookieNamesToClear()]).toEqual(['refresh_token']);
  });

  it('production では新旧 (__Host-refresh_token + refresh_token) 両方を clear 対象にする', async () => {
    vi.stubEnv('NODE_ENV', 'production');
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
