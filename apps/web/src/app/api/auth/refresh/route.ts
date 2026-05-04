/**
 * Refresh Token ローテーションエンドポイント
 *
 * POST /api/auth/refresh
 *
 * WHY: アクセストークン（15分）が期限切れになった場合、
 * クライアントはこのエンドポイントで Refresh Token から新しいアクセストークンを取得する。
 *
 * セキュリティ設計:
 * - `markUsedAtomically` の戻り値で `won` / `reuse_detected` / `expired` / `not_found` を分岐。
 * - 並列リフレッシュの敗者は `reuse_detected` として family 失効（正当な並列使用も巻き込む）。
 * - 期限切れ・存在しないトークンは family 失効せずに 401 + cookie clear のみ。
 */
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { refreshTokenStore } from '@chibatech/db/src/refresh-token-store';
import { createRefreshToken } from '@chibatech/shared';
import { validateStateChangingRequest } from '@/lib/api-guard';
import {
  LEGACY_REFRESH_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
  clearRefreshTokenCookieOptions,
  refreshTokenCookieOptions,
} from '@/lib/auth-cookies';

export const dynamic = 'force-dynamic';

export async function POST(request?: Request) {
  if (request) {
    const guard = validateStateChangingRequest(request);
    if (guard) return guard;
  }

  const cookieStore = await cookies();
  const rawToken =
    cookieStore.get(REFRESH_TOKEN_COOKIE)?.value ??
    cookieStore.get(LEGACY_REFRESH_TOKEN_COOKIE)?.value;

  if (!rawToken) {
    return NextResponse.json({ error: 'No refresh token' }, { status: 401 });
  }

  const result = await refreshTokenStore.markUsedAtomically(rawToken);

  if (result.outcome === 'reuse_detected') {
    // WHY: race loser（正当な並列リフレッシュ含む）または使用済みトークンの再送信。
    // いずれも family 全失効で盗難可能性に対応する（保守的設計）。
    await refreshTokenStore.revokeFamily(result.family);
    const response = NextResponse.json(
      { error: 'Token reuse detected, all sessions revoked' },
      { status: 403 }
    );
    clearRefreshTokenCookies(response);
    return response;
  }

  if (result.outcome === 'expired' || result.outcome === 'not_found') {
    // WHY: 期限切れは攻撃兆候ではない。family は触らず 401 + cookie clear のみ
    const response = NextResponse.json(
      { error: result.outcome === 'expired' ? 'Refresh token expired' : 'Invalid refresh token' },
      { status: 401 }
    );
    clearRefreshTokenCookies(response);
    return response;
  }

  // result.outcome === 'won': 新しいトークンを発行し、同一 family を引き継ぐ
  const issue = createRefreshToken(result.record.userId, result.record.family);
  await refreshTokenStore.save(issue.record);

  const response = NextResponse.json({ success: true });
  response.cookies.set(REFRESH_TOKEN_COOKIE, issue.rawToken, refreshTokenCookieOptions());
  return response;
}

function clearRefreshTokenCookies(response: NextResponse) {
  response.cookies.set(REFRESH_TOKEN_COOKIE, '', clearRefreshTokenCookieOptions());
  if (REFRESH_TOKEN_COOKIE !== LEGACY_REFRESH_TOKEN_COOKIE) {
    response.cookies.set(LEGACY_REFRESH_TOKEN_COOKIE, '', clearRefreshTokenCookieOptions());
  }
}
