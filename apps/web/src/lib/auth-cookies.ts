import { REFRESH_TOKEN_EXPIRY } from '@chibatech/shared';

export const LEGACY_REFRESH_TOKEN_COOKIE = 'refresh_token';
export const REFRESH_TOKEN_COOKIE =
  process.env.NODE_ENV === 'production'
    ? '__Host-refresh_token'
    : LEGACY_REFRESH_TOKEN_COOKIE;

export function refreshTokenCookieOptions(maxAge = REFRESH_TOKEN_EXPIRY) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict' as const,
    path: '/',
    maxAge,
  };
}

export function clearRefreshTokenCookieOptions() {
  return refreshTokenCookieOptions(0);
}

// WHY: 本番では __Host- prefix に切り替えたが、移行期は旧名 cookie が
// クライアントに残っているケースがある。clear 経路（signOut / refresh の
// reuse 検知 / 期限切れ）では新旧両方を必ず削除して取りこぼしを防ぐ。
const REFRESH_TOKEN_COOKIE_NAMES_TO_CLEAR: readonly string[] =
  REFRESH_TOKEN_COOKIE === LEGACY_REFRESH_TOKEN_COOKIE
    ? [REFRESH_TOKEN_COOKIE]
    : [REFRESH_TOKEN_COOKIE, LEGACY_REFRESH_TOKEN_COOKIE];

export function refreshTokenCookieNamesToClear(): readonly string[] {
  return REFRESH_TOKEN_COOKIE_NAMES_TO_CLEAR;
}
