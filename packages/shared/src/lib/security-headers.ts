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
  return directives.join('; ');
}

/** 許可するオリジン */
export const ALLOWED_ORIGINS: string[] = [
  'https://chibatech-portal.example.com', // 本番
];

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
