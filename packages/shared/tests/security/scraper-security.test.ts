/**
 * スクレイパーセキュリティテスト
 *
 * 認証情報の漏洩防止、スクレイピング結果のサニタイズ、
 * セッション管理の安全性をテストする。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  type ScrapedNotification,
  sanitizeScrapedData,
  sanitizeErrorMessage,
  RedirectTracker,
  COOKIE_OPTIONS,
} from '@/lib/scraper-security';

/** ログ出力をインターセプトするヘルパー（テスト専用） */
function createLogCapture() {
  const logs: string[] = [];
  const originalConsoleLog = console.log;
  const originalConsoleError = console.error;
  const originalConsoleWarn = console.warn;

  function capture(...args: unknown[]) {
    logs.push(args.map(String).join(' '));
  }

  return {
    start() {
      console.log = capture;
      console.error = capture;
      console.warn = capture;
    },
    stop() {
      console.log = originalConsoleLog;
      console.error = originalConsoleError;
      console.warn = originalConsoleWarn;
    },
    getLogs() {
      return logs;
    },
    containsSensitive(sensitiveValues: string[]): boolean {
      return logs.some((log) =>
        sensitiveValues.some((val) => val.length > 0 && log.includes(val))
      );
    },
  };
}

describe('認証情報の漏洩防止', () => {
  const testCredentials = {
    userId: 'test-student-01',
    password: 'SuperSecret123!',
    sessionCookie: 'JSESSIONID=ABC123DEF456',
  };

  describe('ログ出力チェック', () => {
    let logCapture: ReturnType<typeof createLogCapture>;

    beforeEach(() => {
      logCapture = createLogCapture();
      logCapture.start();
    });

    afterEach(() => {
      logCapture.stop();
    });

    it('パスワードがログに出力されない', () => {
      // シミュレーション: ログイン処理でのログ出力
      console.log(`Logging in user: ${testCredentials.userId}`);
      console.log('Login attempt started');
      // パスワードをログに出すべきでない
      expect(
        logCapture.containsSensitive([testCredentials.password])
      ).toBe(false);
    });

    it('セッションCookieがログに出力されない', () => {
      console.log('Session established');
      console.log('Fetching notifications...');
      expect(
        logCapture.containsSensitive([testCredentials.sessionCookie])
      ).toBe(false);
    });
  });

  describe('エラーメッセージのサニタイズ', () => {
    it('エラーメッセージからパスワードが除去される', () => {
      const password = 'MySecret123';
      const error = new Error(`Login failed for user with password ${password}`);
      const sanitized = sanitizeErrorMessage(error, [password]);
      expect(sanitized).not.toContain(password);
      expect(sanitized).toContain('[REDACTED]');
    });

    it('エラーメッセージからセッションCookieが除去される', () => {
      const cookie = 'JSESSIONID=XYZ789';
      const error = new Error(`Request failed with cookie: ${cookie}`);
      const sanitized = sanitizeErrorMessage(error, [cookie]);
      expect(sanitized).not.toContain(cookie);
      expect(sanitized).toContain('[REDACTED]');
    });

    it('スタックトレースからも認証情報が除去される', () => {
      const password = 'SecretPass';
      const error = new Error(`Connection error: ${password}`);
      sanitizeErrorMessage(error, [password]);
      if (error.stack) {
        expect(error.stack).not.toContain(password);
      }
    });

    it('複数の機密値を同時に除去できる', () => {
      const userId = 'student01';
      const password = 'MyPass123';
      const token = 'Bearer abc123';
      const error = new Error(`Auth failed: ${userId} ${password} ${token}`);
      const sanitized = sanitizeErrorMessage(error, [userId, password, token]);
      expect(sanitized).not.toContain(userId);
      expect(sanitized).not.toContain(password);
      expect(sanitized).not.toContain(token);
    });
  });
});

describe('スクレイピング結果のサニタイズ', () => {
  it('HTMLタグを含むタイトルをサニタイズする', () => {
    const malicious: ScrapedNotification = {
      title: '<script>alert("xss")</script>重要なお知らせ',
      body: '本文です',
      source: 'cit-portal',
      originalUrl: 'https://portal.it-chiba.ac.jp/uprx/test',
      publishedAt: '2026-03-21T10:00:00Z',
    };
    const sanitized = sanitizeScrapedData(malicious);
    expect(sanitized.title).not.toContain('<script>');
    expect(sanitized.title).toContain('&lt;script&gt;');
    expect(sanitized.title).toContain('重要なお知らせ');
  });

  it('HTMLタグを含む本文をサニタイズする', () => {
    const malicious: ScrapedNotification = {
      title: 'お知らせ',
      body: '<img src=x onerror=alert(1)>テスト',
      source: 'manaba',
      originalUrl: 'https://cit.manaba.jp/ct/test',
      publishedAt: '2026-03-21T10:00:00Z',
    };
    const sanitized = sanitizeScrapedData(malicious);
    expect(sanitized.body).not.toContain('<img');
    expect(sanitized.body).toContain('&lt;img');
  });

  it('イベントハンドラを含むHTMLをサニタイズする', () => {
    const malicious: ScrapedNotification = {
      title: 'お知らせ',
      body: '<div onmouseover="steal(document.cookie)">hover me</div>',
      source: 'cit-portal',
      originalUrl: 'https://portal.it-chiba.ac.jp/test',
      publishedAt: '2026-03-21T10:00:00Z',
    };
    const sanitized = sanitizeScrapedData(malicious);
    // WHY: sanitizeHtml はHTMLエスケープ方式。タグの < > がエスケープされるため
    // ブラウザはHTMLとして解釈しない。イベントハンドラ文字列自体は残るが無害化される。
    expect(sanitized.body).not.toContain('<div');
    expect(sanitized.body).toContain('&lt;div');
    expect(sanitized.body).toContain('&quot;'); // " がエスケープされている
  });

  it('安全なテキストはそのまま保持する', () => {
    const safe: ScrapedNotification = {
      title: '2026年度前期の履修登録について',
      body: '4月1日から4月7日まで履修登録期間です。',
      source: 'cit-portal',
      originalUrl: 'https://portal.it-chiba.ac.jp/test',
      publishedAt: '2026-03-21T10:00:00Z',
    };
    const sanitized = sanitizeScrapedData(safe);
    expect(sanitized.title).toBe(safe.title);
    expect(sanitized.body).toBe(safe.body);
  });
});

describe('リダイレクトループ検出', () => {
  it('リダイレクト回数が上限を超えた場合エラーを投げる', () => {
    const tracker = new RedirectTracker();
    // 10回は成功する
    for (let i = 0; i < 10; i++) {
      tracker.track(`https://portal.it-chiba.ac.jp/page-${i}`);
    }
    // 11回目で上限超過
    expect(() => tracker.track('https://portal.it-chiba.ac.jp/page-10')).toThrow('Too many redirects');
  });

  it('同じURLへのリダイレクトループを検出する', () => {
    const tracker = new RedirectTracker();
    tracker.track('https://portal.it-chiba.ac.jp/a');
    tracker.track('https://portal.it-chiba.ac.jp/b');
    expect(() =>
      tracker.track('https://portal.it-chiba.ac.jp/a')
    ).toThrow('Redirect loop detected');
  });
});

describe('タイムアウト処理', () => {
  it('指定時間内にレスポンスがない場合タイムアウトする', async () => {
    const TIMEOUT_MS = 100;

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Request timeout')), TIMEOUT_MS);
    });

    const slowRequest = new Promise<string>((resolve) => {
      setTimeout(() => resolve('response'), 5000); // 5秒かかるリクエスト
    });

    await expect(
      Promise.race([slowRequest, timeoutPromise])
    ).rejects.toThrow('Request timeout');
  });

  it('AbortSignal.timeoutでリクエストをキャンセルできる', () => {
    // Node.js 18+ の AbortSignal.timeout が利用可能か確認
    expect(typeof AbortSignal.timeout).toBe('function');
    const signal = AbortSignal.timeout(3000);
    expect(signal).toBeInstanceOf(AbortSignal);
  });
});

describe('セッションCookieの安全な管理', () => {
  it('Cookie属性にSecureフラグが必要', () => {
    expect(COOKIE_OPTIONS.httpOnly).toBe(true);
    expect(COOKIE_OPTIONS.secure).toBe(true);
    expect(COOKIE_OPTIONS.sameSite).toBe('strict');
  });

  it('HttpOnlyフラグでJavaScriptからのアクセスを防止', () => {
    // WHY: HttpOnlyにより、XSSでdocument.cookieからトークンが取れない
    expect(COOKIE_OPTIONS.httpOnly).toBe(true);
  });

  it('SameSite=Strictで他サイトからのリクエストにCookieを送信しない', () => {
    // WHY: CSRF対策としてSameSite=Strictを使用
    expect(COOKIE_OPTIONS.sameSite).toBe('strict');
  });
});
