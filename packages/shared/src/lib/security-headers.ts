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

/** Content Security Policy ディレクティブ */
export const REQUIRED_CSP_DIRECTIVES: string[] = [
  "default-src 'self'",
  // WHY: Next.js は hydration/ルーティング用の inline script を挿入する。
  // これをブロックすると React が hydrate できず、onSubmit 等のイベントハンドラが
  // アタッチされない（結果としてログインフォームがネイティブGET送信になる）。
  // 将来的には per-request nonce + 'strict-dynamic' への移行が望ましい。
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'", // Tailwind CSS
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  'frame-ancestors none',
];

/** CSPヘッダー文字列を生成する */
export function buildCspHeader(): string {
  return REQUIRED_CSP_DIRECTIVES.join('; ');
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
