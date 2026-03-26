/**
 * Next.js Edge Middleware
 *
 * WHY: エッジで認証チェックとセキュリティヘッダー付与を行い、
 * 未認証リクエストがAPIまで到達しないようにする。
 */
import NextAuth from 'next-auth';
import { authConfig } from '@/lib/auth.config';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
// WHY: @chibatech/shared のバレルエクスポート経由だと encryption.ts/auth.ts の
// node:crypto がバンドルされ Edge Runtime で失敗する。
// セキュリティヘッダーのみ直接パスでインポートする。
import {
  REQUIRED_SECURITY_HEADERS,
  buildCspHeader,
} from '@chibatech/shared/src/lib/security-headers';

const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const response = NextResponse.next();

  // WHY: 全レスポンスにセキュリティヘッダーを付与
  for (const [key, value] of Object.entries(REQUIRED_SECURITY_HEADERS)) {
    response.headers.set(key, value);
  }
  response.headers.set('Content-Security-Policy', buildCspHeader());

  return response;
});

export const config = {
  // WHY: 静的アセット・画像・favicon はミドルウェアをスキップ
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
