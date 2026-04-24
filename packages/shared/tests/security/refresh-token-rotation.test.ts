/**
 * Refresh Token ローテーションテスト
 *
 * WHY: トークンローテーションのセキュリティ要件を検証する。
 * - createRefreshToken は { rawToken, record } を返し、record.token は HMAC ハッシュ
 * - markUsedAtomically は won / reuse_detected / expired / not_found を厳密に分岐
 * - 盗難検知: 使用済みトークン再利用 → ファミリー全体を失効
 * - 並列リフレッシュ: 正当な多重送信でも race loser は reuse_detected（by design）
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  InMemoryRefreshTokenStore,
  createRefreshToken,
  hashRefreshToken,
  getRefreshTokenPepper,
  REFRESH_TOKEN_EXPIRY,
} from '../../src/lib/auth';
import type { RefreshTokenStore } from '../../src/lib/auth';

const TEST_PEPPER = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

describe('Refresh Tokenローテーション', () => {
  const originalPepper = process.env.REFRESH_TOKEN_PEPPER;

  beforeEach(() => {
    process.env.REFRESH_TOKEN_PEPPER = TEST_PEPPER;
  });

  afterEach(() => {
    if (originalPepper === undefined) {
      delete process.env.REFRESH_TOKEN_PEPPER;
    } else {
      process.env.REFRESH_TOKEN_PEPPER = originalPepper;
    }
  });

  describe('getRefreshTokenPepper', () => {
    it('未設定の場合エラーを投げる', () => {
      delete process.env.REFRESH_TOKEN_PEPPER;
      expect(() => getRefreshTokenPepper()).toThrow('REFRESH_TOKEN_PEPPER is not set');
    });

    it('64文字未満の場合エラーを投げる', () => {
      process.env.REFRESH_TOKEN_PEPPER = '0123456789abcdef';
      expect(() => getRefreshTokenPepper()).toThrow('64 hex characters');
    });

    it('非hex文字を含む場合エラーを投げる', () => {
      process.env.REFRESH_TOKEN_PEPPER = 'z'.repeat(64);
      expect(() => getRefreshTokenPepper()).toThrow('64 hex characters');
    });

    it('有効な64-hexを受け入れる', () => {
      expect(getRefreshTokenPepper()).toBe(TEST_PEPPER);
    });
  });

  describe('hashRefreshToken', () => {
    it('決定的: 同じrawトークンは同じハッシュ', () => {
      const h1 = hashRefreshToken('raw-token-1');
      const h2 = hashRefreshToken('raw-token-1');
      expect(h1).toBe(h2);
    });

    it('異なるrawトークンは異なるハッシュ', () => {
      expect(hashRefreshToken('raw-token-1')).not.toBe(hashRefreshToken('raw-token-2'));
    });

    it('pepperが変わるとハッシュも変わる', () => {
      const h1 = hashRefreshToken('raw-token-1');
      process.env.REFRESH_TOKEN_PEPPER = 'f'.repeat(64);
      const h2 = hashRefreshToken('raw-token-1');
      expect(h1).not.toBe(h2);
    });
  });

  describe('createRefreshToken', () => {
    it('rawTokenとrecordを返す', () => {
      const issue = createRefreshToken('user-1');
      expect(issue.rawToken).toBeTruthy();
      expect(issue.record.userId).toBe('user-1');
      expect(issue.record.family).toBeTruthy();
      expect(issue.record.used).toBe(false);
    });

    it('record.tokenはrawTokenのHMACハッシュ（生トークンではない）', () => {
      const issue = createRefreshToken('user-1');
      expect(issue.record.token).toBe(hashRefreshToken(issue.rawToken));
      expect(issue.record.token).not.toBe(issue.rawToken);
    });

    it('同一ファミリーでトークンを発行できる', () => {
      const rt1 = createRefreshToken('user-1');
      const rt2 = createRefreshToken('user-1', rt1.record.family);
      expect(rt2.record.family).toBe(rt1.record.family);
      expect(rt2.rawToken).not.toBe(rt1.rawToken);
    });

    it('有効期限が7日後', () => {
      const issue = createRefreshToken('user-1');
      const expectedExpiry = Date.now() + REFRESH_TOKEN_EXPIRY * 1000;
      expect(Math.abs(issue.record.expiresAt.getTime() - expectedExpiry)).toBeLessThan(1000);
    });
  });

  describe('InMemoryRefreshTokenStore', () => {
    let store: RefreshTokenStore;

    beforeEach(() => {
      store = new InMemoryRefreshTokenStore();
    });

    it('rawTokenでsave → findByRawToken できる', async () => {
      const issue = createRefreshToken('user-1');
      await store.save(issue.record);

      const found = await store.findByRawToken(issue.rawToken);
      expect(found).not.toBeNull();
      expect(found!.userId).toBe('user-1');
      expect(found!.used).toBe(false);
    });

    it('存在しないrawTokenはnullを返す', async () => {
      const found = await store.findByRawToken('nonexistent-raw-token');
      expect(found).toBeNull();
    });

    describe('markUsedAtomically', () => {
      it('新鮮なトークン → won + record', async () => {
        const issue = createRefreshToken('user-1');
        await store.save(issue.record);

        const result = await store.markUsedAtomically(issue.rawToken);
        expect(result.outcome).toBe('won');
        if (result.outcome !== 'won') return;
        expect(result.record.userId).toBe('user-1');
        expect(result.record.used).toBe(true);
      });

      it('使用済みトークン → reuse_detected + family', async () => {
        const issue = createRefreshToken('user-1');
        await store.save(issue.record);
        await store.markUsedAtomically(issue.rawToken); // 1回目: won

        const result = await store.markUsedAtomically(issue.rawToken); // 2回目: reuse
        expect(result.outcome).toBe('reuse_detected');
        if (result.outcome !== 'reuse_detected') return;
        expect(result.family).toBe(issue.record.family);
      });

      it('期限切れトークン → expired（family失効はしない）', async () => {
        const issue = createRefreshToken('user-1');
        await store.save({
          ...issue.record,
          expiresAt: new Date(Date.now() - 1000),
        });

        const result = await store.markUsedAtomically(issue.rawToken);
        expect(result.outcome).toBe('expired');
      });

      it('存在しないトークン → not_found', async () => {
        const result = await store.markUsedAtomically('nonexistent-raw-token');
        expect(result.outcome).toBe('not_found');
      });

      it('parallel legitimate requests also revoke family by design: 並列呼び出しで片方だけwon、もう片方はreuse_detected', async () => {
        // WHY: 同一トークンへの同時リフレッシュ（タブ2枚など正当なケース）も
        // race loser は reuse_detected として family 失効の対象。保守的設計。
        const issue = createRefreshToken('user-1');
        await store.save(issue.record);

        const [r1, r2] = await Promise.all([
          store.markUsedAtomically(issue.rawToken),
          store.markUsedAtomically(issue.rawToken),
        ]);

        const outcomes = [r1.outcome, r2.outcome].sort();
        expect(outcomes).toEqual(['reuse_detected', 'won']);
      });
    });
  });

  describe('正常ローテーションフロー', () => {
    let store: RefreshTokenStore;

    beforeEach(() => {
      store = new InMemoryRefreshTokenStore();
    });

    it('rt1を使用済みにし、同一familyで新トークンrt2を発行できる', async () => {
      const rt1 = createRefreshToken('user-1');
      await store.save(rt1.record);

      const marked = await store.markUsedAtomically(rt1.rawToken);
      expect(marked.outcome).toBe('won');

      const rt2 = createRefreshToken('user-1', rt1.record.family);
      await store.save(rt2.record);

      const found2 = await store.findByRawToken(rt2.rawToken);
      expect(found2!.family).toBe(rt1.record.family);
      expect(found2!.used).toBe(false);
    });
  });

  describe('盗難検知', () => {
    let store: RefreshTokenStore;

    beforeEach(() => {
      store = new InMemoryRefreshTokenStore();
    });

    it('使用済みトークン再利用を検知してファミリー失効するフル・フロー', async () => {
      const rt1 = createRefreshToken('user-1');
      await store.save(rt1.record);

      // 正規ローテーション rt1 → rt2
      const won1 = await store.markUsedAtomically(rt1.rawToken);
      expect(won1.outcome).toBe('won');
      const rt2 = createRefreshToken('user-1', rt1.record.family);
      await store.save(rt2.record);

      // 攻撃者が rt1 を再利用
      const reuse = await store.markUsedAtomically(rt1.rawToken);
      expect(reuse.outcome).toBe('reuse_detected');
      if (reuse.outcome !== 'reuse_detected') return;

      // family全失効 → rt2 も無効化
      await store.revokeFamily(reuse.family);
      expect(await store.findByRawToken(rt2.rawToken)).toBeNull();
    });
  });

  describe('ユーザー全トークン失効', () => {
    let store: RefreshTokenStore;

    beforeEach(() => {
      store = new InMemoryRefreshTokenStore();
    });

    it('複数ファミリー（多デバイス）をまとめて失効できる', async () => {
      const rt1 = createRefreshToken('user-1');
      const rt2 = createRefreshToken('user-1');
      await store.save(rt1.record);
      await store.save(rt2.record);
      expect(rt1.record.family).not.toBe(rt2.record.family);

      await store.revokeAllForUser('user-1');

      expect(await store.findByRawToken(rt1.rawToken)).toBeNull();
      expect(await store.findByRawToken(rt2.rawToken)).toBeNull();
    });

    it('他ユーザーのトークンには影響しない', async () => {
      const rt1 = createRefreshToken('user-1');
      const rt2 = createRefreshToken('user-2');
      await store.save(rt1.record);
      await store.save(rt2.record);

      await store.revokeAllForUser('user-1');

      expect(await store.findByRawToken(rt1.rawToken)).toBeNull();
      expect(await store.findByRawToken(rt2.rawToken)).not.toBeNull();
    });
  });
});
