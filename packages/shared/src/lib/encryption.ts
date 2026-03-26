/**
 * 認証情報の暗号化・復号モジュール
 *
 * WHY: ユーザーのCIT Portal/manaba認証情報をDBに安全に保存するため、
 * AES-256-GCMで暗号化する。GCMモードは暗号化と同時に改ざん検知（認証タグ）を提供する。
 */
import crypto from 'node:crypto';

export interface EncryptedData {
  /** 暗号文（Base64） */
  ciphertext: string;
  /** 初期化ベクトル（Base64、毎回ランダム生成） */
  iv: string;
  /** 認証タグ（Base64、GCMモードの改ざん検知用） */
  authTag: string;
}

export interface EncryptionService {
  encrypt(plaintext: string, masterKey: Buffer): EncryptedData;
  decrypt(data: EncryptedData, masterKey: Buffer): string;
}

/**
 * AES-256-GCM 暗号化サービスの実装
 */
export function createEncryptionService(): EncryptionService {
  return {
    encrypt(plaintext: string, masterKey: Buffer): EncryptedData {
      // WHY: GCMの推奨IVサイズは96bit（12バイト）。毎回ランダム生成で一意性を保証
      const iv = crypto.randomBytes(12);
      const cipher = crypto.createCipheriv('aes-256-gcm', masterKey, iv);
      const encrypted = Buffer.concat([
        cipher.update(plaintext, 'utf8'),
        cipher.final(),
      ]);
      const authTag = cipher.getAuthTag();
      return {
        ciphertext: encrypted.toString('base64'),
        iv: iv.toString('base64'),
        authTag: authTag.toString('base64'),
      };
    },

    decrypt(data: EncryptedData, masterKey: Buffer): string {
      const decipher = crypto.createDecipheriv(
        'aes-256-gcm',
        masterKey,
        Buffer.from(data.iv, 'base64')
      );
      decipher.setAuthTag(Buffer.from(data.authTag, 'base64'));
      const decrypted = Buffer.concat([
        decipher.update(Buffer.from(data.ciphertext, 'base64')),
        decipher.final(),
      ]);
      return decrypted.toString('utf8');
    },
  };
}

/**
 * マスターキーを環境変数から安全に取得する
 * @throws マスターキーが未設定または不正な長さの場合
 */
export function getMasterKey(): Buffer {
  const keyHex = process.env.ENCRYPTION_MASTER_KEY;
  if (!keyHex) {
    throw new Error('ENCRYPTION_MASTER_KEY is not set');
  }
  const key = Buffer.from(keyHex, 'hex');
  // WHY: AES-256は256bit（32バイト）のキーが必要
  if (key.length !== 32) {
    throw new Error('ENCRYPTION_MASTER_KEY must be 256 bits (64 hex characters)');
  }
  return key;
}
