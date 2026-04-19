/**
 * Prisma Refresh Token Store の結合テスト
 *
 * WHY: InMemory 実装だけでは `updateMany` の行ロックによる原子性を検証できない。
 * 実 Postgres に対して `markUsedAtomically` の並列挙動を確認する。
 *
 * 実行条件: CI unit-test ジョブの Postgres サービス接続（DATABASE_URL 設定済み）。
 * REFRESH_TOKEN_PEPPER は本ファイル内で固定値を注入する。
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';

// WHY: hashRefreshToken 等の初期化より前に pepper を設定する必要がある
process.env.REFRESH_TOKEN_PEPPER ??= '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

import { prisma } from '../src/index';
import { PrismaRefreshTokenStore } from '../src/refresh-token-store';
import { createRefreshToken } from '@chibatech/shared';
import { hashSync } from 'bcryptjs';

const TEST_USER_STUDENT_ID = 'T99RTTEST';

describe('PrismaRefreshTokenStore', () => {
  const store = new PrismaRefreshTokenStore();
  let testUserId: string;

  beforeAll(async () => {
    // WHY: Foreign Key 制約のためテスト用ユーザーを事前作成
    const user = await prisma.user.upsert({
      where: { studentId: TEST_USER_STUDENT_ID },
      update: {},
      create: {
        studentId: TEST_USER_STUDENT_ID,
        email: 'rt-test@example.com',
        passwordHash: hashSync('placeholder', 4),
      },
    });
    testUserId = user.id;
  });

  beforeEach(async () => {
    // WHY: テスト間の干渉を防ぐため、対象ユーザーのトークンを毎回クリア
    await prisma.refreshToken.deleteMany({ where: { userId: testUserId } });
  });

  afterAll(async () => {
    await prisma.refreshToken.deleteMany({ where: { userId: testUserId } });
    await prisma.user.delete({ where: { id: testUserId } }).catch(() => {});
    await prisma.$disconnect();
  });

  it('save + findByRawToken (HMAC 経路の確認)', async () => {
    const issue = createRefreshToken(testUserId);
    await store.save(issue.record);

    const found = await store.findByRawToken(issue.rawToken);
    expect(found).not.toBeNull();
    expect(found!.userId).toBe(testUserId);
    expect(found!.used).toBe(false);
  });

  it('markUsedAtomically: 新鮮なトークン → won', async () => {
    const issue = createRefreshToken(testUserId);
    await store.save(issue.record);

    const result = await store.markUsedAtomically(issue.rawToken);
    expect(result.outcome).toBe('won');
    if (result.outcome !== 'won') return;
    expect(result.record.used).toBe(true);
  });

  it('markUsedAtomically: 既に使用済み → reuse_detected', async () => {
    const issue = createRefreshToken(testUserId);
    await store.save(issue.record);
    await store.markUsedAtomically(issue.rawToken);

    const result = await store.markUsedAtomically(issue.rawToken);
    expect(result.outcome).toBe('reuse_detected');
    if (result.outcome !== 'reuse_detected') return;
    expect(result.family).toBe(issue.record.family);
  });

  it('markUsedAtomically: 期限切れ → expired', async () => {
    const issue = createRefreshToken(testUserId);
    await store.save({
      ...issue.record,
      expiresAt: new Date(Date.now() - 1000),
    });

    const result = await store.markUsedAtomically(issue.rawToken);
    expect(result.outcome).toBe('expired');
  });

  it('markUsedAtomically: 存在しないトークン → not_found', async () => {
    const result = await store.markUsedAtomically('nonexistent-raw-token-1234');
    expect(result.outcome).toBe('not_found');
  });

  it('parallel legitimate requests also revoke family by design: Promise.all で片方のみ won、もう片方は reuse_detected', async () => {
    // WHY: updateMany の Postgres 行ロックで片方だけが count===1 を返す想定。
    // 正当な並列（タブ2枚同時リフレッシュ）も race loser は family 失効の対象。
    const issue = createRefreshToken(testUserId);
    await store.save(issue.record);

    const [r1, r2] = await Promise.all([
      store.markUsedAtomically(issue.rawToken),
      store.markUsedAtomically(issue.rawToken),
    ]);

    const outcomes = [r1.outcome, r2.outcome].sort();
    expect(outcomes).toEqual(['reuse_detected', 'won']);

    // reuse_detected 側が family を保持していることを確認
    const loser = [r1, r2].find((r) => r.outcome === 'reuse_detected');
    if (loser && loser.outcome === 'reuse_detected') {
      expect(loser.family).toBe(issue.record.family);
    }
  });

  it('revokeFamily で family 全トークンが削除される', async () => {
    const rt1 = createRefreshToken(testUserId);
    await store.save(rt1.record);
    const rt2 = createRefreshToken(testUserId, rt1.record.family);
    await store.save(rt2.record);

    await store.revokeFamily(rt1.record.family);

    expect(await store.findByRawToken(rt1.rawToken)).toBeNull();
    expect(await store.findByRawToken(rt2.rawToken)).toBeNull();
  });

  it('revokeAllForUser で対象ユーザーの全トークンが削除される', async () => {
    const rt1 = createRefreshToken(testUserId);
    const rt2 = createRefreshToken(testUserId);
    await store.save(rt1.record);
    await store.save(rt2.record);

    await store.revokeAllForUser(testUserId);

    expect(await store.findByRawToken(rt1.rawToken)).toBeNull();
    expect(await store.findByRawToken(rt2.rawToken)).toBeNull();
  });
});
