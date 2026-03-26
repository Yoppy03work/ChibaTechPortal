/**
 * Auth.js v5 設定
 *
 * WHY: Credentials Provider でChibaTechPortalのローカルDB認証（学籍番号+パスワード）を実装。
 * CIT Portal/manabaの外部認証情報は別途 /api/credentials で暗号化保存する。
 * JWTベースのセッション管理で、アクセストークンは15分の短寿命。
 */
import type { NextAuthConfig } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import { prisma } from '@chibatech/db';
import { loginSchema, InMemoryRateLimiter, RATE_LIMITS } from '@chibatech/shared';

// WHY: ログイン試行のブルートフォース攻撃を防止
const loginRateLimiter = new InMemoryRateLimiter();

export const authConfig: NextAuthConfig = {
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

        // WHY: ブルートフォース対策。学籍番号単位でレートリミット
        const rateResult = await loginRateLimiter.check(
          `login:${parsed.data.studentId}`,
          RATE_LIMITS.login
        );
        if (!rateResult.allowed) {
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

  session: {
    strategy: 'jwt',
    // WHY: アクセストークン15分で短寿命化し、セッションハイジャックのリスクを最小化
    maxAge: 15 * 60, // 15分
  },

  pages: {
    signIn: '/login',
  },

  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.sub = user.id;
        token.studentId = (user as { studentId?: string }).studentId;
      }
      return token;
    },

    async session({ session, token }) {
      if (token.sub) {
        session.user.id = token.sub;
        (session.user as { studentId?: string }).studentId = token.studentId as string;
      }
      return session;
    },

    // WHY: 認証不要パスと認証必須パスを明確に分離
    async authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const isAuthPage = nextUrl.pathname.startsWith('/login') ||
                         nextUrl.pathname.startsWith('/register');
      const isApiAuth = nextUrl.pathname.startsWith('/api/auth');

      if (isAuthPage || isApiAuth) {
        return true;
      }

      if (!isLoggedIn) {
        return false;
      }

      return true;
    },
  },
};
