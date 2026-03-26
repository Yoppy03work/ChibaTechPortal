/**
 * Prismaベースの Refresh Token ストア
 *
 * WHY: InMemoryRefreshTokenStoreはプロセス再起動でトークンが消失する。
 * Prisma経由でPostgreSQLに永続化し、分散環境でもトークン管理を一元化する。
 */
import { prisma } from './index';
import type { RefreshTokenStore, RefreshTokenRecord } from '@chibatech/shared';

export class PrismaRefreshTokenStore implements RefreshTokenStore {
  async save(record: RefreshTokenRecord): Promise<void> {
    await prisma.refreshToken.create({
      data: {
        token: record.token,
        userId: record.userId,
        expiresAt: record.expiresAt,
        used: record.used,
        family: record.family,
      },
    });
  }

  async findByToken(token: string): Promise<RefreshTokenRecord | null> {
    const row = await prisma.refreshToken.findUnique({
      where: { token },
    });

    if (!row) return null;

    return {
      token: row.token,
      userId: row.userId,
      expiresAt: row.expiresAt,
      used: row.used,
      family: row.family,
    };
  }

  async markUsed(token: string): Promise<void> {
    await prisma.refreshToken.update({
      where: { token },
      data: { used: true },
    });
  }

  /**
   * WHY: 使用済みトークンが再利用された場合、同一ファミリーの全トークンを無効化する。
   * これにより盗難されたトークンチェーン全体を失効させる。
   */
  async revokeFamily(family: string): Promise<void> {
    await prisma.refreshToken.deleteMany({
      where: { family },
    });
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await prisma.refreshToken.deleteMany({
      where: { userId },
    });
  }
}

/** シングルトンインスタンス */
export const refreshTokenStore = new PrismaRefreshTokenStore();
