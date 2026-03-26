/**
 * 認証情報ストア
 *
 * WHY: ユーザーのCIT Portal/manaba認証情報を暗号化した状態でDBに保存する。
 * 本番ではPrisma経由でPostgreSQLに保存するが、同一インターフェースで動作する。
 */
import type { EncryptedData } from './encryption';

export interface UserCredentialRow {
  userId: string;
  citPortalCreds: string; // JSON(EncryptedData) — 暗号化済み
  manabaCreds: string; // JSON(EncryptedData) — 暗号化済み
}

export interface CredentialStore {
  save(userId: string, citCreds: EncryptedData, manabaCreds: EncryptedData): Promise<void>;
  get(userId: string): Promise<UserCredentialRow | null>;
}

/**
 * インメモリ認証情報ストア
 * WHY: 本番では Prisma + PostgreSQL に置き換えるが、同一インターフェースで動作する
 */
export class InMemoryCredentialStore implements CredentialStore {
  private rows: Map<string, UserCredentialRow> = new Map();

  async save(userId: string, citCreds: EncryptedData, manabaCreds: EncryptedData): Promise<void> {
    this.rows.set(userId, {
      userId,
      citPortalCreds: JSON.stringify(citCreds),
      manabaCreds: JSON.stringify(manabaCreds),
    });
  }

  async get(userId: string): Promise<UserCredentialRow | null> {
    return this.rows.get(userId) ?? null;
  }

  /** DBの全データを返す（テスト・デバッグ用） */
  getRawData(): UserCredentialRow[] {
    return [...this.rows.values()];
  }
}
