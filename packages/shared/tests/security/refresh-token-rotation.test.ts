/**
 * Refresh Tokenローテーションテスト
 *
 * WHY: トークンローテーションのセキュリティ要件を検証する。
 * - 正常ローテーション: 使用→新トークン発行→同ファミリー
 * - 盗難検知: 使用済みトークン再利用→ファミリー全体無効化
 * - 期限切れ: 有効期限超過→拒否
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  InMemoryRefreshTokenStore,
  createRefreshToken,
  REFRESH_TOKEN_EXPIRY,
} from '../../src/lib/auth';
import type { RefreshTokenStore, RefreshTokenRecord } from '../../src/lib/auth';

describe('Refresh Tokenローテーション', () => {
  let store: RefreshTokenStore;

  beforeEach(() => {
    store = new InMemoryRefreshTokenStore();
  });

  describe('createRefreshToken', () => {
    it('ユーザーIDとファミリーを持つトークンを生成する', () => {
      const rt = createRefreshToken('user-1');
      expect(rt.token).toBeTruthy();
      expect(rt.userId).toBe('user-1');
      expect(rt.family).toBeTruthy();
      expect(rt.used).toBe(false);
      expect(rt.expiresAt.getTime()).toBeGreaterThan(Date.now());
    });

    it('同一ファミリーでトークンを生成できる', () => {
      const rt1 = createRefreshToken('user-1');
      const rt2 = createRefreshToken('user-1', rt1.family);
      expect(rt2.family).toBe(rt1.family);
      expect(rt2.token).not.toBe(rt1.token);
    });

    it('有効期限が7日後に設定される', () => {
      const rt = createRefreshToken('user-1');
      const expectedExpiry = Date.now() + REFRESH_TOKEN_EXPIRY * 1000;
      // 1秒以内の誤差を許容
      expect(Math.abs(rt.expiresAt.getTime() - expectedExpiry)).toBeLessThan(1000);
    });
  });

  describe('RefreshTokenStore（InMemory実装）', () => {
    it('トークンを保存して取得できる', async () => {
      const rt = createRefreshToken('user-1');
      await store.save(rt);

      const found = await store.findByToken(rt.token);
      expect(found).not.toBeNull();
      expect(found!.userId).toBe('user-1');
      expect(found!.used).toBe(false);
    });

    it('存在しないトークンはnullを返す', async () => {
      const found = await store.findByToken('nonexistent');
      expect(found).toBeNull();
    });

    it('トークンを使用済みにできる', async () => {
      const rt = createRefreshToken('user-1');
      await store.save(rt);
      await store.markUsed(rt.token);

      const found = await store.findByToken(rt.token);
      expect(found!.used).toBe(true);
    });
  });

  describe('正常ローテーション', () => {
    it('使用済みトークンから同ファミリーの新トークンを発行できる', async () => {
      // 1. 初回トークン生成
      const rt1 = createRefreshToken('user-1');
      await store.save(rt1);

      // 2. rt1を使用済みにして新トークンを発行
      await store.markUsed(rt1.token);
      const rt2 = createRefreshToken('user-1', rt1.family);
      await store.save(rt2);

      // 3. rt1は使用済み、rt2は未使用
      const found1 = await store.findByToken(rt1.token);
      expect(found1!.used).toBe(true);

      const found2 = await store.findByToken(rt2.token);
      expect(found2!.used).toBe(false);
      expect(found2!.family).toBe(rt1.family);
    });
  });

  describe('盗難検知（ファミリー無効化）', () => {
    it('ファミリー全体を無効化できる', async () => {
      const rt1 = createRefreshToken('user-1');
      await store.save(rt1);

      const rt2 = createRefreshToken('user-1', rt1.family);
      await store.save(rt2);

      // ファミリー無効化
      await store.revokeFamily(rt1.family);

      // 両方とも取得不可
      expect(await store.findByToken(rt1.token)).toBeNull();
      expect(await store.findByToken(rt2.token)).toBeNull();
    });

    it('使用済みトークンの再利用を検知してファミリー無効化するフロー', async () => {
      // 1. 初回トークン
      const rt1 = createRefreshToken('user-1');
      await store.save(rt1);

      // 2. 正常ローテーション: rt1 → rt2
      await store.markUsed(rt1.token);
      const rt2 = createRefreshToken('user-1', rt1.family);
      await store.save(rt2);

      // 3. 攻撃者がrt1を再利用 → used=trueを検知
      const stolen = await store.findByToken(rt1.token);
      expect(stolen!.used).toBe(true);

      // 4. ファミリー全体を無効化
      await store.revokeFamily(stolen!.family);

      // 5. rt2も無効化される（正規ユーザーも再ログインが必要）
      expect(await store.findByToken(rt2.token)).toBeNull();
    });
  });

  describe('ユーザー全トークン失効', () => {
    it('ログアウト時にユーザーの全トークンを失効できる', async () => {
      // 2つのファミリー（2デバイス想定）
      const rt1 = createRefreshToken('user-1');
      const rt2 = createRefreshToken('user-1');
      await store.save(rt1);
      await store.save(rt2);

      expect(rt1.family).not.toBe(rt2.family);

      // 全トークン失効
      await store.revokeAllForUser('user-1');

      expect(await store.findByToken(rt1.token)).toBeNull();
      expect(await store.findByToken(rt2.token)).toBeNull();
    });

    it('他ユーザーのトークンには影響しない', async () => {
      const rt1 = createRefreshToken('user-1');
      const rt2 = createRefreshToken('user-2');
      await store.save(rt1);
      await store.save(rt2);

      await store.revokeAllForUser('user-1');

      expect(await store.findByToken(rt1.token)).toBeNull();
      expect(await store.findByToken(rt2.token)).not.toBeNull();
    });
  });
});
