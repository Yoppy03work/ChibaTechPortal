/**
 * Next.js Edge Middleware
 *
 * WHY: エッジで認証チェック、CORS 制御、セキュリティヘッダー、per-request CSP nonce
 * を付与する。未認証リクエストや不正オリジンからのリクエストが API まで到達しないようにする。
 */
import NextAuth from 'next-auth';
import { authConfig } from '@/lib/auth.config';
import { NextResponse } from 'next/server';
// WHY: @chibatech/shared のバレルエクスポート経由だと encryption.ts/auth.ts の
// node:crypto がバンドルされ Edge Runtime で失敗する。直接パスでインポート。
import {
  REQUIRED_SECURITY_HEADERS,
  buildCspHeader,
  isOriginAllowed,
} from '@chibatech/shared/src/lib/security-headers';

const { auth } = NextAuth(authConfig);

/**
 * WHY: Edge Runtime で使えるのは Web Crypto のみ。`crypto.getRandomValues` で
 * 128bit 乱数を作り base64 化して nonce とする。
 */
function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let str = '';
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str);
}

export default auth((req) => {
  const origin = req.headers.get('origin');
  const isApiRoute = req.nextUrl.pathname.startsWith('/api/');

  // --- CORS: プリフライト（OPTIONS）処理 ---
  if (req.method === 'OPTIONS' && isApiRoute) {
    if (!isOriginAllowed(origin)) {
      return new NextResponse(null, { status: 403 });
    }
    const preflightResponse = new NextResponse(null, { status: 204 });
    if (origin) {
      preflightResponse.headers.set('Access-Control-Allow-Origin', origin);
      preflightResponse.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      preflightResponse.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      preflightResponse.headers.set('Access-Control-Allow-Credentials', 'true');
      preflightResponse.headers.set('Access-Control-Max-Age', '86400');
    }
    return preflightResponse;
  }

  // --- CORS: APIリクエストのOrigin検証 ---
  // WHY: 許可外Originからのクロスオリジンリクエストを拒否
  if (isApiRoute && origin && !isOriginAllowed(origin)) {
    return new NextResponse(null, { status: 403 });
  }

  // --- per-request CSP nonce ---
  // WHY: Next.js 16 は request header の `x-nonce` を読んで内部 hydration script に
  // nonce 属性を付与する。response ヘッダだけでは伝搬しないため、
  // NextResponse.next({ request: { headers } }) で request headers にも載せる。
  const nonce = generateNonce();
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set('x-nonce', nonce);

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });

  // --- セキュリティヘッダー ---
  for (const [key, value] of Object.entries(REQUIRED_SECURITY_HEADERS)) {
    response.headers.set(key, value);
  }
  response.headers.set('Content-Security-Policy', buildCspHeader(nonce));

  // --- CORS: 許可されたOriginにはCORSヘッダーを付与 ---
  if (isApiRoute && origin && isOriginAllowed(origin)) {
    response.headers.set('Access-Control-Allow-Origin', origin);
    response.headers.set('Access-Control-Allow-Credentials', 'true');
  }

  return response;
});

export const config = {
  // WHY: 静的アセット・画像・favicon はミドルウェアをスキップ
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
