/**
 * Next.js Edge Middleware
 *
 * WHY: エッジで認証チェック、セキュリティヘッダー、per-request CSP nonce を付与する。
 * 未認証リクエストが API まで到達しないようにする。
 */
import NextAuth from 'next-auth';
import { authConfig } from '@/lib/auth.config';
import { NextResponse } from 'next/server';
// WHY: @chibatech/shared のバレルエクスポート経由だと encryption.ts/auth.ts の
// node:crypto がバンドルされ Edge Runtime で失敗する。
// セキュリティヘッダーのみ直接パスでインポートする。
import {
  REQUIRED_SECURITY_HEADERS,
  buildCspHeader,
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
  const nonce = generateNonce();

  // WHY: Next.js 16 は request header の `x-nonce` を読んで内部 hydration script
  // に nonce 属性を付与する。response ヘッダだけでは伝搬しないため、
  // NextResponse.next({ request: { headers } }) で request headers にも載せる。
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set('x-nonce', nonce);

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });

  for (const [key, value] of Object.entries(REQUIRED_SECURITY_HEADERS)) {
    response.headers.set(key, value);
  }
  response.headers.set('Content-Security-Policy', buildCspHeader(nonce));

  return response;
});

export const config = {
  // WHY: 静的アセット・画像・favicon はミドルウェアをスキップ
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
