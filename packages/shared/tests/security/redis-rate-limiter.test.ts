/**
 * RedisRateLimiterテスト
 *
 * WHY: 分散環境でレートリミットが正しく動作することを検証する
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { RedisRateLimiter } from '../../src/lib/redis-rate-limiter';
import type { RedisClient } from '../../src/lib/redis-rate-limiter';
import type { RateLimitConfig } from '../../src/lib/rate-limiter';

/** Redisモック（インメモリでRedisの振る舞いを再現） */
function createMockRedis(): RedisClient & { store: Map<string, { count: number; ttl: number; expiresAt: number }> } {
  const store = new Map<string, { count: number; ttl: number; expiresAt: number }>();

  return {
    store,
    async incr(key: string): Promise<number> {
      const now = Date.now();
      const existing = store.get(key);

      if (existing && existing.expiresAt > now) {
        existing.count++;
        return existing.count;
      }

      // キーが存在しないか期限切れ
      store.set(key, { count: 1, ttl: -1, expiresAt: Infinity });
      return 1;
    },
    async expire(key: string, seconds: number): Promise<number> {
      const existing = store.get(key);
      if (!existing) return 0;
      if (seconds <= 0) {
        store.delete(key);
        return 1;
      }
      existing.ttl = seconds;
      existing.expiresAt = Date.now() + seconds * 1000;
      return 1;
    },
    async ttl(key: string): Promise<number> {
      const existing = store.get(key);
      if (!existing) return -2;
      if (existing.expiresAt === Infinity) return -1;
      const remaining = Math.ceil((existing.expiresAt - Date.now()) / 1000);
      return Math.max(remaining, 0);
    },
  };
}

describe('RedisRateLimiter', () => {
  let redis: ReturnType<typeof createMockRedis>;
  let limiter: RedisRateLimiter;
  const config: RateLimitConfig = { maxRequests: 3, windowSeconds: 60 };

  beforeEach(() => {
    redis = createMockRedis();
    limiter = new RedisRateLimiter(redis, 'test');
  });

  it('制限内のリクエストを許可する', async () => {
    const result = await limiter.check('user:1', config);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(2);
  });

  it('カウントが正しくインクリメントされる', async () => {
    const r1 = await limiter.check('user:1', config);
    const r2 = await limiter.check('user:1', config);
    const r3 = await limiter.check('user:1', config);

    expect(r1.remaining).toBe(2);
    expect(r2.remaining).toBe(1);
    expect(r3.remaining).toBe(0);
    expect(r3.allowed).toBe(true);
  });

  it('制限を超えたリクエストを拒否する', async () => {
    await limiter.check('user:1', config);
    await limiter.check('user:1', config);
    await limiter.check('user:1', config);

    const r4 = await limiter.check('user:1', config);
    expect(r4.allowed).toBe(false);
    expect(r4.remaining).toBe(0);
  });

  it('異なるキーは独立してカウントされる', async () => {
    await limiter.check('user:1', config);
    await limiter.check('user:1', config);
    await limiter.check('user:1', config);

    const result = await limiter.check('user:2', config);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(2);
  });

  it('resetでカウントがクリアされる', async () => {
    await limiter.check('user:1', config);
    await limiter.check('user:1', config);
    await limiter.check('user:1', config);

    await limiter.reset('user:1');

    const result = await limiter.check('user:1', config);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(2);
  });

  it('resetAtが未来の時刻を返す', async () => {
    const now = Date.now();
    const result = await limiter.check('user:1', config);
    expect(result.resetAt.getTime()).toBeGreaterThanOrEqual(now);
  });

  it('Redisキーにprefixが付与される', async () => {
    await limiter.check('user:1', config);
    expect(redis.store.has('test:user:1')).toBe(true);
  });
});
