/**
 * Redisベースのレートリミッター
 *
 * WHY: InMemoryRateLimiterはプロセス再起動・複数インスタンスで制限が回避される。
 * Redis INCR + EXPIRE による Fixed Window Counter で分散環境でも正しくカウントする。
 */
import type { RateLimiter, RateLimitConfig, RateLimitResult } from './rate-limiter';

/**
 * Redis操作に必要な最小インターフェース
 * WHY: ioredisへの直接依存を避け、テストでモック可能にする
 */
export interface RedisClient {
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<number>;
  ttl(key: string): Promise<number>;
}

/**
 * Redisベースの Fixed Window Counter レートリミッター
 */
export class RedisRateLimiter implements RateLimiter {
  private readonly redis: RedisClient;
  private readonly keyPrefix: string;

  constructor(redis: RedisClient, keyPrefix = 'rl') {
    this.redis = redis;
    this.keyPrefix = keyPrefix;
  }

  async check(key: string, config: RateLimitConfig): Promise<RateLimitResult> {
    const redisKey = `${this.keyPrefix}:${key}`;

    // WHY: INCRはキーが存在しない場合に0から始めて1を返す（アトミック）
    const count = await this.redis.incr(redisKey);

    if (count === 1) {
      // WHY: 最初のリクエストでウィンドウの有効期限を設定
      await this.redis.expire(redisKey, config.windowSeconds);
    }

    // TTLからリセット時刻を算出
    const ttl = await this.redis.ttl(redisKey);
    const resetAt = new Date(Date.now() + Math.max(ttl, 0) * 1000);

    if (count > config.maxRequests) {
      return {
        allowed: false,
        remaining: 0,
        resetAt,
      };
    }

    return {
      allowed: true,
      remaining: config.maxRequests - count,
      resetAt,
    };
  }

  async reset(key: string): Promise<void> {
    // WHY: delはRedisClientインターフェースに含めず、expireで即座に失効させる
    await this.redis.expire(`${this.keyPrefix}:${key}`, 0);
  }
}
