/**
 * E2E テスト用: ログイン/登録レートリミットのキーを削除する
 *
 * WHY: 同一の E2E テストユーザーで複数テストがログインすると、
 * `RATE_LIMITS.login` (5回/5分) に当たって 6件目以降が 401 となり
 * waitForURL がタイムアウトする。各テスト前にキーを消して安定化する。
 * FLUSHDB は使わず、ログイン/登録の prefix に限定する（ローカル誤爆防止）。
 */
import IORedis from 'ioredis';

const RATE_LIMIT_KEY_PATTERNS = ['rl:login:*', 'rl:register:*'];

export async function resetRateLimits(): Promise<void> {
  const redis = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
    maxRetriesPerRequest: 1,
  });

  try {
    for (const pattern of RATE_LIMIT_KEY_PATTERNS) {
      let cursor = '0';
      do {
        const [nextCursor, keys] = await redis.scan(
          cursor,
          'MATCH',
          pattern,
          'COUNT',
          100
        );
        cursor = nextCursor;
        if (keys.length > 0) {
          await redis.del(...keys);
        }
      } while (cursor !== '0');
    }
  } finally {
    await redis.quit();
  }
}
