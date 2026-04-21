/**
 * Auth.js v5 Edge互換設定
 *
 * WHY: この設定はEdge Middleware（middleware.ts）からインポートされるため、
 * Node.jsモジュール（node:crypto, bcryptjs, prisma, ioredis等）を使用してはならない。
 * Credentials Providerの認証ロジック（authorize関数）はauth.tsに分離する。
 */
import type { NextAuthConfig } from 'next-auth';

export const authConfig = {
  // WHY: providersは空。auth.tsでCredentials Providerを追加する
  providers: [],

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
} satisfies NextAuthConfig;
