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
import { prisma } from '@chibatech/db';
import { loginSchema, RATE_LIMITS, getClientIp } from '@chibatech/shared';
import { rateLimiter } from './rate-limiter';
import { authConfig } from './auth.config';

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
        // WHY: Zodで入力バリデーションしてからDB照合
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) {
          return null;
        }

        // WHY: ブルートフォース対策。IP単位 + 学籍番号単位の2重レートリミット（Redisベース）
        // WHY: IPが取得できない場合はIPベースリミットをスキップ（共有バケット問題回避）
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

        // 学籍番号単位: 特定アカウントへの集中攻撃を防止
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
});
