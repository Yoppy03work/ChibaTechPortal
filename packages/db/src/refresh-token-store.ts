/**
 * Prisma ベースの Refresh Token ストア
 *
 * WHY: public API はすべて **生トークン (rawToken)** を受け取り、HMAC 化はこのモジュール内部で行う。
 * アプリ層には hash/raw の認知負荷を出さず、誤って生トークンを DB に保存するリスクを排除する。
 *
 * セキュリティ設計:
 * - DB 保存・検索は常に HMAC-SHA256(raw, REFRESH_TOKEN_PEPPER) のハッシュ。
 * - `markUsedAtomically` は `updateMany` の条件付き単一原子更新で race を解決する。
 *   count === 1 なら自分が勝者、0 なら used / expired / not_found を SELECT で分類。
 * - 期限切れ行は残す（攻撃兆候ではない）。TODO: 別途 cleanup job で削除する。
 */
import { prisma } from './index';
import {
  hashRefreshToken,
  type RefreshTokenStore,
  type RefreshTokenRecord,
  type MarkUsedResult,
} from '@chibatech/shared';

function toRecord(row: {
  token: string;
  userId: string;
  expiresAt: Date;
  used: boolean;
  family: string;
}): RefreshTokenRecord {
  return {
    token: row.token,
    userId: row.userId,
    expiresAt: row.expiresAt,
    used: row.used,
    family: row.family,
  };
}

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

  async findByRawToken(rawToken: string): Promise<RefreshTokenRecord | null> {
    const tokenHash = hashRefreshToken(rawToken);
    const row = await prisma.refreshToken.findUnique({
      where: { token: tokenHash },
    });
    return row ? toRecord(row) : null;
  }

  async markUsedAtomically(rawToken: string): Promise<MarkUsedResult> {
    const tokenHash = hashRefreshToken(rawToken);
    const now = new Date();

    // WHY: 単一 updateMany で「未使用かつ未期限」を原子的に使用済みへ遷移。
    // 並列呼び出しでは Postgres の行ロックにより片方だけ count === 1 を返す。
    const result = await prisma.refreshToken.updateMany({
      where: {
        token: tokenHash,
        used: false,
        expiresAt: { gt: now },
      },
      data: { used: true },
    });

    if (result.count === 1) {
      const row = await prisma.refreshToken.findUnique({ where: { token: tokenHash } });
      if (!row) {
        // WHY: 自分が勝った直後に別プロセス（revokeFamily 等）が削除した稀ケース。
        // 防御的に not_found 扱い（route 側は 401 + cookie clear）
        return { outcome: 'not_found' };
      }
      return { outcome: 'won', record: toRecord(row) };
    }

    // count === 0 の原因を分類
    const row = await prisma.refreshToken.findUnique({ where: { token: tokenHash } });
    if (!row) return { outcome: 'not_found' };
    if (row.used) return { outcome: 'reuse_detected', family: row.family };
    if (row.expiresAt <= now) return { outcome: 'expired' };
    // 理論上到達しない（updateMany 条件と SELECT 条件が同じ）。防御的に not_found
    return { outcome: 'not_found' };
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

export const refreshTokenStore = new PrismaRefreshTokenStore();
