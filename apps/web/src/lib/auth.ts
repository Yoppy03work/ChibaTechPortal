/**
 * Auth.js v5 インスタンス
 */
import NextAuth from 'next-auth';
import { authConfig } from './auth.config';

export const {
  handlers,
  auth,
  signIn,
  signOut,
} = NextAuth(authConfig);
