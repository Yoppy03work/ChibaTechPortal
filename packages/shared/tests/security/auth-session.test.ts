/**
 * 認証・セッション管理テスト
 *
 * JWT生成・検証、Refresh Tokenローテーション、セッション無効化をテストする。
 * テスト対象: src/lib/auth.ts の実装
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as jose from 'jose';
import crypto from 'node:crypto';
import {
  type JwtPayload,
  type RefreshTokenRecord,
  ACCESS_TOKEN_EXPIRY,
  REFRESH_TOKEN_EXPIRY,
  getJwtSecret,
  generateAccessToken,
  verifyAccessToken,
  InMemoryRefreshTokenStore,
  createRefreshToken,
} from '@/lib/auth';

// --- テスト用ヘルパー ---

const TEST_SECRET = 'a'.repeat(32) + '-test-jwt-secret-key-for-testing';
const TEST_SECRET_BYTES = new TextEncoder().encode(TEST_SECRET);

/** テスト用: 有効期限をカスタマイズしたトークン生成（期限切れテスト等に使用） */
async function createTestAccessTokenWithExpiry(
  payload: { sub: string; studentId: string },
  options?: { expiresIn?: number; secret?: Uint8Array }
): Promise<string> {
  const secret = options?.secret ?? TEST_SECRET_BYTES;
  const expiresIn = options?.expiresIn ?? ACCESS_TOKEN_EXPIRY;

  return new jose.SignJWT({
    sub: payload.sub,
    studentId: payload.studentId,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + expiresIn)
    .sign(secret);
}

describe('JWT アクセストークン', () => {
  describe('トークン生成', () => {
    it('有効なJWTを生成できる', async () => {
      const token = await generateAccessToken(
        { sub: 'user-123', studentId: 'M24G1140' },
        TEST_SECRET_BYTES
      );
      expect(token).toBeTruthy();
      expect(token.split('.')).toHaveLength(3); // header.payload.signature
    });

    it('ペイロードにsub（ユーザーID）とstudentIdが含まれる', async () => {
      const token = await generateAccessToken(
        { sub: 'user-123', studentId: 'M24G1140' },
        TEST_SECRET_BYTES
      );
      const payload = await verifyAccessToken(token, TEST_SECRET_BYTES);
      expect(payload.sub).toBe('user-123');
      expect(payload.studentId).toBe('M24G1140');
    });

    it('iat（発行時刻）が含まれる', async () => {
      const before = Math.floor(Date.now() / 1000);
      const token = await generateAccessToken(
        { sub: 'user-123', studentId: 'M24G1140' },
        TEST_SECRET_BYTES
      );
      const payload = await verifyAccessToken(token, TEST_SECRET_BYTES);
      const after = Math.floor(Date.now() / 1000);
      expect(payload.iat).toBeGreaterThanOrEqual(before);
      expect(payload.iat).toBeLessThanOrEqual(after);
    });

    it('exp（有効期限）が15分後に設定される', async () => {
      const now = Math.floor(Date.now() / 1000);
      const token = await generateAccessToken(
        { sub: 'user-123', studentId: 'M24G1140' },
        TEST_SECRET_BYTES
      );
      const payload = await verifyAccessToken(token, TEST_SECRET_BYTES);
      // 15分（900秒）± 2秒の誤差を許容
      expect(payload.exp).toBeGreaterThanOrEqual(now + ACCESS_TOKEN_EXPIRY - 2);
      expect(payload.exp).toBeLessThanOrEqual(now + ACCESS_TOKEN_EXPIRY + 2);
    });
  });

  describe('トークン検証', () => {
    it('有効なトークンを正しく検証できる', async () => {
      const token = await generateAccessToken(
        { sub: 'user-123', studentId: 'M24G1140' },
        TEST_SECRET_BYTES
      );
      const payload = await verifyAccessToken(token, TEST_SECRET_BYTES);
      expect(payload.sub).toBe('user-123');
    });

    it('期限切れトークンを拒否する', async () => {
      const token = await createTestAccessTokenWithExpiry(
        { sub: 'user-123', studentId: 'M24G1140' },
        { expiresIn: -1 } // 過去に期限切れ
      );
      await expect(verifyAccessToken(token, TEST_SECRET_BYTES)).rejects.toThrow();
    });

    it('異なるシークレットで署名されたトークンを拒否する', async () => {
      const wrongSecret = new TextEncoder().encode('wrong-secret-key-that-is-long-enough-32chars');
      const token = await createTestAccessTokenWithExpiry(
        { sub: 'user-123', studentId: 'M24G1140' },
        { secret: wrongSecret }
      );
      await expect(verifyAccessToken(token, TEST_SECRET_BYTES)).rejects.toThrow();
    });

    it('改ざんされたペイロードのトークンを拒否する', async () => {
      const token = await generateAccessToken(
        { sub: 'user-123', studentId: 'M24G1140' },
        TEST_SECRET_BYTES
      );
      // ペイロード部分を改ざん
      const parts = token.split('.');
      const payload = JSON.parse(Buffer.from(parts[1]!, 'base64url').toString());
      payload.sub = 'admin-hacked';
      parts[1] = Buffer.from(JSON.stringify(payload)).toString('base64url');
      const tampered = parts.join('.');
      await expect(verifyAccessToken(tampered, TEST_SECRET_BYTES)).rejects.toThrow();
    });

    it('不正なフォーマットのトークンを拒否する', async () => {
      await expect(verifyAccessToken('not-a-jwt', TEST_SECRET_BYTES)).rejects.toThrow();
      await expect(verifyAccessToken('', TEST_SECRET_BYTES)).rejects.toThrow();
      await expect(verifyAccessToken('a.b', TEST_SECRET_BYTES)).rejects.toThrow();
    });
  });
});

describe('Refresh Token ローテーション', () => {
  let store: InMemoryRefreshTokenStore;

  beforeEach(() => {
    store = new InMemoryRefreshTokenStore();
  });

  it('Refresh Tokenを生成してストアに保存できる', async () => {
    const token = crypto.randomUUID();
    const family = crypto.randomUUID();
    const record: RefreshTokenRecord = {
      token,
      userId: 'user-123',
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_EXPIRY * 1000),
      used: false,
      family,
    };
    await store.save(record);
    const found = await store.findByToken(token);
    expect(found).not.toBeNull();
    expect(found!.userId).toBe('user-123');
    expect(found!.used).toBe(false);
  });

  it('使用済みRefresh Tokenを再利用しようとすると検知できる', async () => {
    const token = crypto.randomUUID();
    const family = crypto.randomUUID();
    await store.save({
      token,
      userId: 'user-123',
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_EXPIRY * 1000),
      used: false,
      family,
    });

    // 1回目の使用: 正常
    await store.markUsed(token);
    const record = await store.findByToken(token);
    expect(record!.used).toBe(true);

    // 2回目の使用: 盗難の可能性 → ファミリー全体を無効化
    if (record!.used) {
      await store.revokeFamily(family);
    }
    const revoked = await store.findByToken(token);
    expect(revoked).toBeNull();
  });

  it('期限切れRefresh Tokenを拒否する', async () => {
    const token = crypto.randomUUID();
    await store.save({
      token,
      userId: 'user-123',
      expiresAt: new Date(Date.now() - 1000), // 過去
      used: false,
      family: crypto.randomUUID(),
    });

    const record = await store.findByToken(token);
    expect(record).not.toBeNull();
    expect(record!.expiresAt.getTime()).toBeLessThan(Date.now());
  });

  it('トークンファミリー全体を無効化できる', async () => {
    const family = crypto.randomUUID();
    const token1 = crypto.randomUUID();
    const token2 = crypto.randomUUID();

    await store.save({
      token: token1,
      userId: 'user-123',
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_EXPIRY * 1000),
      used: true,
      family,
    });
    await store.save({
      token: token2,
      userId: 'user-123',
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_EXPIRY * 1000),
      used: false,
      family,
    });

    await store.revokeFamily(family);
    expect(await store.findByToken(token1)).toBeNull();
    expect(await store.findByToken(token2)).toBeNull();
  });
});

describe('セッション無効化（ログアウト）', () => {
  let store: InMemoryRefreshTokenStore;

  beforeEach(() => {
    store = new InMemoryRefreshTokenStore();
  });

  it('ユーザーの全セッションを無効化できる', async () => {
    const userId = 'user-123';
    // 複数デバイスからのセッション
    await store.save({
      token: crypto.randomUUID(),
      userId,
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_EXPIRY * 1000),
      used: false,
      family: crypto.randomUUID(),
    });
    await store.save({
      token: crypto.randomUUID(),
      userId,
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_EXPIRY * 1000),
      used: false,
      family: crypto.randomUUID(),
    });

    await store.revokeAllForUser(userId);

    // 他のユーザーのセッションは影響しない
    const otherToken = crypto.randomUUID();
    await store.save({
      token: otherToken,
      userId: 'other-user',
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_EXPIRY * 1000),
      used: false,
      family: crypto.randomUUID(),
    });
    expect(await store.findByToken(otherToken)).not.toBeNull();
  });
});

describe('JWT Secret 管理', () => {
  const originalEnv = process.env.JWT_SECRET;

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.JWT_SECRET = originalEnv;
    } else {
      delete process.env.JWT_SECRET;
    }
  });

  it('JWT_SECRET が未設定の場合エラーを投げる', () => {
    delete process.env.JWT_SECRET;
    expect(() => getJwtSecret()).toThrow('JWT_SECRET is not set');
  });

  it('JWT_SECRET が32文字未満の場合エラーを投げる', () => {
    process.env.JWT_SECRET = 'short';
    expect(() => getJwtSecret()).toThrow('at least 32 characters');
  });

  it('十分な長さのJWT_SECRETを取得できる', () => {
    process.env.JWT_SECRET = TEST_SECRET;
    const secret = getJwtSecret();
    expect(secret).toBe(TEST_SECRET);
    expect(secret.length).toBeGreaterThanOrEqual(32);
  });
});
