/**
 * Web アプリ用 Redis 接続
 *
 * WHY: レートリミッタ等でRedisを使用する。
 * ioredisはNode.jsランタイムでのみ使用可能（Edge middlewareでは不可）。
 */
import IORedis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

export const redis = new IORedis(REDIS_URL, {
  maxRetriesPerRequest: null,
  lazyConnect: true, // WHY: インポート時に即接続しない。初回使用時に接続
});
