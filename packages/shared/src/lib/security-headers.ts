/**
 * セキュリティヘッダー・CORS・認証パス定義
 *
 * WHY: Next.js middleware で適用するセキュリティヘッダーを一箇所で管理し、
 * テストで検証できるようにする。
 */

/** 全レスポンスに付与する必須セキュリティヘッダー */
export const REQUIRED_SECURITY_HEADERS: Record<string, string> = {
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  // WHY: 最新ブラウザではCSPで対応。XSS-Protectionは誤検知リスクがある
  'X-XSS-Protection': '0',
  // WHY: キャンパス検知のために geolocation は self のみ許可
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(self)',
};

/**
 * Content Security Policy ディレクティブの基本構成（script-src は buildCspHeader で差し替え）
 *
 * WHY: script-src は nonce 方式で per-request に変わるため、ここには含めない。
 * テスト・ドキュメント用に「nonce なしの strict デフォルト」も buildCspHeader(undefined)
 * で取得可能。
 */
export const REQUIRED_CSP_DIRECTIVES: string[] = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'", // Tailwind CSS
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  'frame-ancestors none',
];

/**
 * CSP ヘッダー文字列を生成する。
 *
 * WHY: Next.js は hydration/ルーティング用の inline script を挿入するため、
 * `'self'` のみだと React が hydrate できない。middleware で per-request nonce を
 * 生成し `script-src 'self' 'nonce-XXX' 'strict-dynamic'` を発行することで、
 * `'unsafe-inline'` を使わずに Next.js のスクリプトを許可する。
 *
 * @param nonce - middleware で生成された base64 nonce。未指定時は strict 設定（テスト用途）
 */
export function buildCspHeader(nonce?: string): string {
  const directives = REQUIRED_CSP_DIRECTIVES.map((d) => {
    if (!d.startsWith('script-src')) return d;
    return nonce
      ? `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`
      : "script-src 'self'";
  });
  if (typeof process !== 'undefined' && process.env.NODE_ENV === 'production') {
    directives.push('upgrade-insecure-requests');
  }
  return directives.join('; ');
}

/** 許可するオリジン（環境変数で追加可能） */
export const ALLOWED_ORIGINS: string[] = [
  'https://chibatech-portal.example.com', // 本番
  ...(typeof process !== 'undefined' && process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean)
    : []),
];

/**
 * Originが許可されているかチェックする
 * WHY: CORS制御でOriginヘッダーを検証し、許可外オリジンからのAPIリクエストを拒否する
 *
 * @param origin - Originヘッダーの値。nullはsame-originリクエスト（許可）
 */
export function isOriginAllowed(origin: string | null): boolean {
  // WHY: same-originリクエスト（Originヘッダーなし = null）は常に許可
  // 空文字列はOriginが明示的に空で送られたケース → 拒否
  if (origin === null) return true;
  if (!origin) return false;

  // WHY: 開発環境では localhost / 127.0.0.1 / [::1] を許可。
  // docker-compose で web を 127.0.0.1:3001 に bind しており、ブラウザが
  // http://127.0.0.1:3001 でアクセスした場合に POST/PUT/PATCH/DELETE の
  // Origin が 127.0.0.1 になるため、localhost と同様に許可する必要がある。
  // production では ALLOWED_ORIGINS のみを参照し、ループバック許可は適用しない。
  if (typeof process !== 'undefined' && process.env.NODE_ENV === 'development') {
    if (
      origin.startsWith('http://localhost:') ||
      origin.startsWith('http://127.0.0.1:') ||
      origin.startsWith('http://[::1]:')
    ) {
      return true;
    }
  }

  return ALLOWED_ORIGINS.includes(origin);
}

/** 認証が必要なAPIパス */
export const AUTH_REQUIRED_PATHS: string[] = [
  '/api/notifications',
  '/api/timetable',
  '/api/attendance',
  '/api/settings',
  '/api/push/subscribe',
  '/api/credentials',
  '/api/assignments',
  '/api/syllabus',
];

/** 認証不要のパス */
export const AUTH_NOT_REQUIRED_PATHS: string[] = [
  '/api/auth/register',
  '/api/auth',
  '/login',
  '/register',
];
