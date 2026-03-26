/**
 * 認証・セッション管理モジュール
 *
 * WHY: JWTの短寿命（15分）+ Refresh Token でセッションハイジャックのリスクを最小化する。
 * Refresh Tokenはローテーション方式で、使用済みトークンの再利用を検知する。
 */
import * as jose from 'jose';
import crypto from 'node:crypto';

export interface JwtPayload {
  sub: string; // ユーザーID
  studentId: string; // 学籍番号
  iat: number; // 発行時刻
  exp: number; // 有効期限
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface RefreshTokenRecord {
  token: string;
  userId: string;
  expiresAt: Date;
  used: boolean; // ローテーション検知用
  family: string; // トークンファミリー（連鎖検知用）
}

/** アクセストークンの有効期限（秒） */
export const ACCESS_TOKEN_EXPIRY = 15 * 60; // 15分

/** Refresh Tokenの有効期限（秒） */
export const REFRESH_TOKEN_EXPIRY = 7 * 24 * 60 * 60; // 7日

/** JWT署名に使用するシークレットキー */
export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET is not set');
  }
  // WHY: 短すぎるシークレットはブルートフォース攻撃に脆弱
  if (secret.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters');
  }
  return secret;
}

// --- JWT アクセストークン ---

/**
 * JWT アクセストークンを生成する（有効期限: 15分）
 */
export async function generateAccessToken(
  payload: { sub: string; studentId: string },
  secret: Uint8Array
): Promise<string> {
  return new jose.SignJWT({
    sub: payload.sub,
    studentId: payload.studentId,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + ACCESS_TOKEN_EXPIRY)
    .sign(secret);
}

/**
 * JWT アクセストークンを検証する
 * @throws 期限切れ・改ざん・不正なトークンの場合
 */
export async function verifyAccessToken(
  token: string,
  secret: Uint8Array
): Promise<JwtPayload> {
  const { payload } = await jose.jwtVerify(token, secret);
  return payload as unknown as JwtPayload;
}

// --- Refresh Token ストア ---

export interface RefreshTokenStore {
  save(record: RefreshTokenRecord): Promise<void>;
  findByToken(token: string): Promise<RefreshTokenRecord | null>;
  markUsed(token: string): Promise<void>;
  revokeFamily(family: string): Promise<void>;
  revokeAllForUser(userId: string): Promise<void>;
}

/**
 * インメモリ Refresh Token ストア
 * WHY: 本番では Redis/PostgreSQL に置き換えるが、同一インターフェースで動作する
 */
export class InMemoryRefreshTokenStore implements RefreshTokenStore {
  private tokens: Map<string, RefreshTokenRecord> = new Map();

  async save(record: RefreshTokenRecord): Promise<void> {
    this.tokens.set(record.token, record);
  }

  async findByToken(token: string): Promise<RefreshTokenRecord | null> {
    return this.tokens.get(token) ?? null;
  }

  async markUsed(token: string): Promise<void> {
    const record = this.tokens.get(token);
    if (record) {
      record.used = true;
    }
  }

  async revokeFamily(family: string): Promise<void> {
    for (const [key, record] of this.tokens) {
      if (record.family === family) {
        this.tokens.delete(key);
      }
    }
  }

  async revokeAllForUser(userId: string): Promise<void> {
    for (const [key, record] of this.tokens) {
      if (record.userId === userId) {
        this.tokens.delete(key);
      }
    }
  }
}

/**
 * 新しい Refresh Token を生成する
 */
export function createRefreshToken(userId: string, family?: string): RefreshTokenRecord {
  return {
    token: crypto.randomUUID(),
    userId,
    expiresAt: new Date(Date.now() + REFRESH_TOKEN_EXPIRY * 1000),
    used: false,
    family: family ?? crypto.randomUUID(),
  };
}
