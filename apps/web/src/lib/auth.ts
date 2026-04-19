/**
 * Auth.js v5 インスタンス（Node.jsランタイム用）
 *
 * WHY: Credentials ProviderはNode.jsモジュール（bcryptjs, prisma, ioredis）を使用するため、
 * Edge互換のauth.config.tsとは分離する。
 * API Routes・Server Componentsからはこのファイルのauth/signIn/signOutを使う。
 * Edge Middlewareからはauth.config.tsのみをインポートする。
 */
import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import { cookies } from 'next/headers';
import { prisma } from '@chibatech/db';
import { refreshTokenStore } from '@chibatech/db/src/refresh-token-store';
import {
  loginSchema,
  RATE_LIMITS,
  getClientIp,
  createRefreshToken,
  REFRESH_TOKEN_EXPIRY,
} from '@chibatech/shared';
import { rateLimiter } from './rate-limiter';
import { authConfig } from './auth.config';

const REFRESH_TOKEN_COOKIE = 'refresh_token';

export const {
  handlers,
  auth,
  signIn,
  signOut,
} = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      name: 'ChibaTechPortal',
      credentials: {
        studentId: { label: '学籍番号', type: 'text', placeholder: 'M24G1140' },
        password: { label: 'パスワード', type: 'password' },
      },
      async authorize(credentials, request) {
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) {
          return null;
        }

        // WHY: ブルートフォース対策。IP+studentIdの2重レートリミット（Redisベース）
        const ip = getClientIp(request.headers);
        if (ip) {
          const ipRateResult = await rateLimiter.check(
            `login:ip:${ip}`,
            RATE_LIMITS.loginPerIp
          );
          if (!ipRateResult.allowed) {
            return null;
          }
        }

        const sidRateResult = await rateLimiter.check(
          `login:sid:${parsed.data.studentId}`,
          RATE_LIMITS.login
        );
        if (!sidRateResult.allowed) {
          return null;
        }

        const user = await prisma.user.findUnique({
          where: { studentId: parsed.data.studentId },
        });

        if (!user) {
          return null;
        }

        const passwordMatch = await bcrypt.compare(
          parsed.data.password,
          user.passwordHash
        );

        if (!passwordMatch) {
          return null;
        }

        return {
          id: user.id,
          studentId: user.studentId,
          email: user.email,
        };
      },
    }),
  ],

  events: {
    /**
     * WHY: ログイン成功時にRefresh Tokenを生成してDB保存 + HttpOnly Cookieに設定。
     * Auth.js jwt callbackではResponseオブジェクトにアクセスできないため、
     * eventsで cookies() を使ってCookieを設定する。
     */
    async signIn({ user }) {
      if (!user?.id) return;

      // WHY: `createRefreshToken` は { rawToken, record } を返す。
      // `rawToken` はクッキーに、`record` (HMAC ハッシュ) は DB に保存する。
      const issue = createRefreshToken(user.id);
      await refreshTokenStore.save(issue.record);

      const cookieStore = await cookies();
      cookieStore.set(REFRESH_TOKEN_COOKIE, issue.rawToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        path: '/',
        maxAge: REFRESH_TOKEN_EXPIRY,
      });
    },

    /**
     * WHY: ログアウト時にユーザーの全Refresh Tokenを無効化し、
     * 他デバイスからの不正アクセスを防止する。
     */
    async signOut(message) {
      // WHY: Auth.js v5ではsignOutのmessageにsession or tokenが含まれる
      // JWT戦略ではtokenが渡される
      const userId = 'token' in message
        ? message.token?.sub
        : undefined;

      if (userId) {
        await refreshTokenStore.revokeAllForUser(userId);
      }

      const cookieStore = await cookies();
      cookieStore.set(REFRESH_TOKEN_COOKIE, '', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        path: '/',
        maxAge: 0,
      });
    },
  },
});
