/**
 * レートリミッター
 *
 * WHY: 学内システムへの過剰なリクエストを防止し、
 * ブロックされるリスクを最小化する。
 * また、ブルートフォース攻撃からの保護も兼ねる。
 */

export interface RateLimitConfig {
  /** ウィンドウ内の最大リクエスト数 */
  maxRequests: number;
  /** ウィンドウサイズ（秒） */
  windowSeconds: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
}

export interface RateLimiter {
  /**
   * リクエストがレートリミット内かチェックし、カウントする
   * @param key - レートリミットのキー（例: userId, IP）
   * @param config - レートリミット設定
   */
  check(key: string, config: RateLimitConfig): Promise<RateLimitResult>;

  /**
   * 指定キーのカウントをリセットする
   */
  reset(key: string): Promise<void>;
}

/**
 * インメモリ RateLimiter 実装
 * WHY: 本番では Redis に置き換えるが、同一インターフェースで動作する
 */
export class InMemoryRateLimiter implements RateLimiter {
  private store: Map<string, { count: number; resetAt: Date }> = new Map();

  async check(key: string, config: RateLimitConfig): Promise<RateLimitResult> {
    const now = new Date();
    const existing = this.store.get(key);

    if (!existing || existing.resetAt <= now) {
      const resetAt = new Date(now.getTime() + config.windowSeconds * 1000);
      this.store.set(key, { count: 1, resetAt });
      return {
        allowed: true,
        remaining: config.maxRequests - 1,
        resetAt,
      };
    }

    if (existing.count >= config.maxRequests) {
      return {
        allowed: false,
        remaining: 0,
        resetAt: existing.resetAt,
      };
    }

    existing.count++;
    return {
      allowed: true,
      remaining: config.maxRequests - existing.count,
      resetAt: existing.resetAt,
    };
  }

  async reset(key: string): Promise<void> {
    this.store.delete(key);
  }
}

/** プリセット設定 */
export const RATE_LIMITS = {
  /** スクレイピング: 15分に1回 */
  scraping: { maxRequests: 1, windowSeconds: 15 * 60 } satisfies RateLimitConfig,

  /** API一般: 1分に60リクエスト */
  api: { maxRequests: 60, windowSeconds: 60 } satisfies RateLimitConfig,

  /** ログイン試行: 学籍番号単位、5分に5回 */
  login: { maxRequests: 5, windowSeconds: 5 * 60 } satisfies RateLimitConfig,

  /** ログイン試行: IP単位、5分に20回 */
  // WHY: 学籍番号を変えながらの総当たりを防止。IP単位は緩めに設定
  loginPerIp: { maxRequests: 20, windowSeconds: 5 * 60 } satisfies RateLimitConfig,

  /** 認証情報更新: 1時間に3回 */
  credentialUpdate: { maxRequests: 3, windowSeconds: 60 * 60 } satisfies RateLimitConfig,
} as const;
