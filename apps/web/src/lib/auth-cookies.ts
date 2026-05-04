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
