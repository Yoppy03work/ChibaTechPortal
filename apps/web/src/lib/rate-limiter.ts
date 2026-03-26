/**
 * Web アプリ用レートリミッタ（シングルトン）
 *
 * WHY: 全APIルートで共有するRedisベースのレートリミッタ。
 * InMemoryRateLimiterはプロセス再起動・複数インスタンスで回避されるため、
 * 本番ではRedisを使用する。
 */
import { RedisRateLimiter } from '@chibatech/shared';
import { redis } from './redis';

// WHY: ioredisインスタンスはRedisClientインターフェースを満たす
export const rateLimiter = new RedisRateLimiter(redis, 'rl');
