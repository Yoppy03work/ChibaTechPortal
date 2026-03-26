/**
 * Refresh Token ローテーションエンドポイント
 *
 * POST /api/auth/refresh
 *
 * WHY: アクセストークン（15分）が期限切れになった場合、
 * クライアントはこのエンドポイントでRefresh Tokenを使って新しいアクセストークンを取得する。
 * ローテーション方式: 使用済みトークンの再利用はファミリー全体を無効化（盗難検知）。
 */
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { refreshTokenStore } from '@chibatech/db/src/refresh-token-store';
import { createRefreshToken, REFRESH_TOKEN_EXPIRY } from '@chibatech/shared';

export const dynamic = 'force-dynamic';

const REFRESH_TOKEN_COOKIE = 'refresh_token';

/** Cookie削除用の共通オプション */
const CLEAR_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  path: '/',
  maxAge: 0,
};

export async function POST() {
  const cookieStore = await cookies();
  const token = cookieStore.get(REFRESH_TOKEN_COOKIE)?.value;

  if (!token) {
    return NextResponse.json({ error: 'No refresh token' }, { status: 401 });
  }

  const record = await refreshTokenStore.findByToken(token);

  if (!record) {
    const response = NextResponse.json({ error: 'Invalid refresh token' }, { status: 401 });
    response.cookies.set(REFRESH_TOKEN_COOKIE, '', CLEAR_COOKIE_OPTIONS);
    return response;
  }

  // WHY: 期限切れトークンは拒否し、ファミリー全体をクリーンアップ
  if (record.expiresAt <= new Date()) {
    await refreshTokenStore.revokeFamily(record.family);
    const response = NextResponse.json({ error: 'Refresh token expired' }, { status: 401 });
    response.cookies.set(REFRESH_TOKEN_COOKIE, '', CLEAR_COOKIE_OPTIONS);
    return response;
  }

  // WHY: 使用済みトークンの再利用 = 盗難の可能性 → ファミリー全体を無効化
  if (record.used) {
    await refreshTokenStore.revokeFamily(record.family);
    const response = NextResponse.json(
      { error: 'Token reuse detected, all sessions revoked' },
      { status: 403 }
    );
    response.cookies.set(REFRESH_TOKEN_COOKIE, '', CLEAR_COOKIE_OPTIONS);
    return response;
  }

  // トークンローテーション: 現在のトークンを使用済みにし、新しいトークンを発行
  await refreshTokenStore.markUsed(token);

  const newToken = createRefreshToken(record.userId, record.family);
  await refreshTokenStore.save(newToken);

  // WHY: HttpOnly + Secure + SameSite=Strict で最大限の保護
  const response = NextResponse.json({ success: true });
  response.cookies.set(REFRESH_TOKEN_COOKIE, newToken.token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: REFRESH_TOKEN_EXPIRY,
  });

  return response;
}
