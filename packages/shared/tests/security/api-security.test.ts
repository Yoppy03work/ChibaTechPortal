/**
 * APIセキュリティテスト
 *
 * レートリミット、認証チェック、認可、セキュリティヘッダーをテストする。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  InMemoryRateLimiter,
  RATE_LIMITS,
} from '@/lib/rate-limiter';
import {
  REQUIRED_SECURITY_HEADERS,
  REQUIRED_CSP_DIRECTIVES,
  buildCspHeader,
  ALLOWED_ORIGINS,
  AUTH_REQUIRED_PATHS,
  AUTH_NOT_REQUIRED_PATHS,
} from '@/lib/security-headers';

describe('レートリミット', () => {
  let limiter: InMemoryRateLimiter;

  beforeEach(() => {
    limiter = new InMemoryRateLimiter();
  });

  describe('スクレイピング制限（15分に1回）', () => {
    it('最初のリクエストを許可する', async () => {
      const result = await limiter.check('user-123:scraping', RATE_LIMITS.scraping);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(0); // maxRequests=1 なので残り0
    });

    it('2回目のリクエストを拒否する', async () => {
      await limiter.check('user-123:scraping', RATE_LIMITS.scraping);
      const result = await limiter.check('user-123:scraping', RATE_LIMITS.scraping);
      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    });

    it('異なるユーザーは独立してカウントされる', async () => {
      await limiter.check('user-A:scraping', RATE_LIMITS.scraping);
      const result = await limiter.check('user-B:scraping', RATE_LIMITS.scraping);
      expect(result.allowed).toBe(true);
    });

    it('リセット後は再びリクエストできる', async () => {
      await limiter.check('user-123:scraping', RATE_LIMITS.scraping);
      await limiter.reset('user-123:scraping');
      const result = await limiter.check('user-123:scraping', RATE_LIMITS.scraping);
      expect(result.allowed).toBe(true);
    });
  });

  describe('ログイン試行制限（5分に5回）', () => {
    it('5回目までのリクエストを許可する', async () => {
      for (let i = 0; i < 5; i++) {
        const result = await limiter.check('ip-192.168.1.1:login', RATE_LIMITS.login);
        expect(result.allowed).toBe(true);
      }
    });

    it('6回目のリクエストを拒否する', async () => {
      for (let i = 0; i < 5; i++) {
        await limiter.check('ip-192.168.1.1:login', RATE_LIMITS.login);
      }
      const result = await limiter.check('ip-192.168.1.1:login', RATE_LIMITS.login);
      expect(result.allowed).toBe(false);
    });

    it('残りリクエスト数が正しくカウントされる', async () => {
      const r1 = await limiter.check('ip-1:login', RATE_LIMITS.login);
      expect(r1.remaining).toBe(4);

      const r2 = await limiter.check('ip-1:login', RATE_LIMITS.login);
      expect(r2.remaining).toBe(3);
    });
  });

  describe('API一般制限（1分に60リクエスト）', () => {
    it('60回目までのリクエストを許可する', async () => {
      for (let i = 0; i < 60; i++) {
        const result = await limiter.check('user-123:api', RATE_LIMITS.api);
        expect(result.allowed).toBe(true);
      }
    });

    it('61回目のリクエストを拒否する', async () => {
      for (let i = 0; i < 60; i++) {
        await limiter.check('user-123:api', RATE_LIMITS.api);
      }
      const result = await limiter.check('user-123:api', RATE_LIMITS.api);
      expect(result.allowed).toBe(false);
    });
  });

  describe('認証情報更新制限（1時間に3回）', () => {
    it('3回目までを許可し、4回目を拒否する', async () => {
      for (let i = 0; i < 3; i++) {
        const result = await limiter.check('user-123:cred', RATE_LIMITS.credentialUpdate);
        expect(result.allowed).toBe(true);
      }
      const result = await limiter.check('user-123:cred', RATE_LIMITS.credentialUpdate);
      expect(result.allowed).toBe(false);
    });
  });

  describe('リセットタイミング', () => {
    it('resetAtが正しい時刻を返す', async () => {
      const before = Date.now();
      const result = await limiter.check('user-123:scraping', RATE_LIMITS.scraping);
      const after = Date.now();

      const expectedResetMin = before + RATE_LIMITS.scraping.windowSeconds * 1000;
      const expectedResetMax = after + RATE_LIMITS.scraping.windowSeconds * 1000;

      expect(result.resetAt.getTime()).toBeGreaterThanOrEqual(expectedResetMin);
      expect(result.resetAt.getTime()).toBeLessThanOrEqual(expectedResetMax);
    });
  });
});

describe('セキュリティヘッダー検証', () => {
  it('全ての必須セキュリティヘッダーが定義されている', () => {
    expect(Object.keys(REQUIRED_SECURITY_HEADERS)).toContain('Strict-Transport-Security');
    expect(Object.keys(REQUIRED_SECURITY_HEADERS)).toContain('X-Frame-Options');
    expect(Object.keys(REQUIRED_SECURITY_HEADERS)).toContain('X-Content-Type-Options');
    expect(Object.keys(REQUIRED_SECURITY_HEADERS)).toContain('Referrer-Policy');
    expect(Object.keys(REQUIRED_SECURITY_HEADERS)).toContain('Permissions-Policy');
  });

  it('HSTSが1年以上のmax-ageを持つ', () => {
    const hsts = REQUIRED_SECURITY_HEADERS['Strict-Transport-Security'];
    const match = hsts.match(/max-age=(\d+)/);
    expect(match).not.toBeNull();
    expect(parseInt(match![1]!, 10)).toBeGreaterThanOrEqual(31536000);
  });

  it('X-Frame-OptionsがDENYに設定されている', () => {
    expect(REQUIRED_SECURITY_HEADERS['X-Frame-Options']).toBe('DENY');
  });

  it('CSPにframe-ancestors noneが含まれる', () => {
    expect(REQUIRED_CSP_DIRECTIVES).toContain('frame-ancestors none');
  });

  it('CSPにdefault-src selfが含まれる', () => {
    const hasDefaultSrc = REQUIRED_CSP_DIRECTIVES.some((d) => d.startsWith("default-src 'self'"));
    expect(hasDefaultSrc).toBe(true);
  });

  it('GeolocationがPermissions-Policyでself限定になっている', () => {
    // WHY: キャンパス検知のために geolocation は self のみ許可
    expect(REQUIRED_SECURITY_HEADERS['Permissions-Policy']).toContain('geolocation=(self)');
  });

  it('カメラとマイクがPermissions-Policyで無効化されている', () => {
    expect(REQUIRED_SECURITY_HEADERS['Permissions-Policy']).toContain('camera=()');
    expect(REQUIRED_SECURITY_HEADERS['Permissions-Policy']).toContain('microphone=()');
  });
});

describe('buildCspHeader（nonce方式）', () => {
  it('nonce未指定ならstrictなscript-src self のみ', () => {
    const csp = buildCspHeader();
    const scriptSrc = csp.split(';').find((d) => d.trim().startsWith('script-src'))!;
    expect(scriptSrc.trim()).toBe("script-src 'self'");
    expect(scriptSrc).not.toContain('nonce');
    expect(scriptSrc).not.toContain('unsafe-inline');
  });

  it('nonce指定時はscript-src selfに加えnonceとstrict-dynamicを発行', () => {
    const csp = buildCspHeader('abc123');
    expect(csp).toContain("'nonce-abc123'");
    expect(csp).toContain("'strict-dynamic'");
    expect(csp).toContain("script-src 'self'");
  });

  it('script-src以外のディレクティブはnonce有無で変わらない', () => {
    const withNonce = buildCspHeader('nonce-xyz');
    const withoutNonce = buildCspHeader();
    for (const dir of ["default-src 'self'", 'frame-ancestors none', "img-src 'self' data:"]) {
      expect(withNonce).toContain(dir);
      expect(withoutNonce).toContain(dir);
    }
  });

  it('script-srcにunsafe-inlineは入らない（XSS緩和を維持）', () => {
    const withNonce = buildCspHeader('abc');
    const scriptSrc = withNonce.split(';').find((d) => d.trim().startsWith('script-src'));
    expect(scriptSrc).toBeDefined();
    expect(scriptSrc).not.toContain("'unsafe-inline'");
  });
});

describe('CORS設定検証', () => {
  it('許可されたオリジンのみを受け入れる', () => {
    const testOrigin = 'https://chibatech-portal.example.com';
    expect(ALLOWED_ORIGINS).toContain(testOrigin);
  });

  it('不正なオリジンを拒否する', () => {
    const maliciousOrigins = [
      'https://evil.com',
      'https://chibatech-portal.example.com.evil.com',
      'null',
      '',
    ];
    for (const origin of maliciousOrigins) {
      expect(ALLOWED_ORIGINS).not.toContain(origin);
    }
  });
});

describe('認証チェック（ミドルウェア想定）', () => {
  it('保護対象のAPIパスが正しく定義されている', () => {
    expect(AUTH_REQUIRED_PATHS).toContain('/api/notifications');
    expect(AUTH_REQUIRED_PATHS).toContain('/api/attendance');
    expect(AUTH_REQUIRED_PATHS).toContain('/api/credentials');
  });

  it('認証不要パスに保護対象のエンドポイントが含まれていない', () => {
    for (const path of AUTH_NOT_REQUIRED_PATHS) {
      expect(AUTH_REQUIRED_PATHS).not.toContain(path);
    }
  });

  it('認証情報更新は認証必須である', () => {
    expect(AUTH_REQUIRED_PATHS).toContain('/api/credentials');
  });
});
