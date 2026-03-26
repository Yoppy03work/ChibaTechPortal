/**
 * 認証情報の復号ヘルパー
 *
 * WHY: Workerがスクレイピング実行時に認証情報を復号する。
 * 復号した平文は使用後すぐにメモリから破棄する。
 */
import type { EncryptedData } from './encryption';
import { createEncryptionService } from './encryption';

const encryptionService = createEncryptionService();

export interface DecryptedCredentials {
  userId: string;
  password: string;
}

/**
 * 暗号化された認証情報を復号する
 *
 * WHY: 戻り値の DecryptedCredentials は使用後すぐに参照を破棄すること。
 * Buffer版の clearableDecrypt を使うとゼロフィルによる明示的な破棄が可能。
 */
export function decryptCredentials(
  encryptedJson: Buffer,
  masterKey: Buffer
): DecryptedCredentials {
  const encryptedData: EncryptedData = JSON.parse(encryptedJson.toString('utf8'));
  const decrypted = encryptionService.decrypt(encryptedData, masterKey);
  const creds: DecryptedCredentials = JSON.parse(decrypted);
  return creds;
}

/**
 * 認証情報を復号し、コールバック内でのみ使用可能にする
 *
 * WHY: コールバック終了後に参照がスコープ外になるため、
 * 認証情報がメモリに残る期間を最小化できる。
 */
export async function withDecryptedCredentials<T>(
  encryptedJson: Buffer,
  masterKey: Buffer,
  fn: (creds: DecryptedCredentials) => Promise<T>
): Promise<T> {
  const creds = decryptCredentials(encryptedJson, masterKey);
  try {
    return await fn(creds);
  } finally {
    // WHY: 文字列はイミュータブルなのでゼロフィルはできないが、
    // 参照をスコープ外にしてGC対象にする
  }
}
