/**
 * 認証情報暗号化テスト
 *
 * AES-256-GCM による暗号化・復号の正常系/異常系を網羅的にテストする。
 * テスト対象: src/lib/encryption.ts の実装（TDD: まずテストを書く）
 */
import { describe, it, expect, beforeEach } from 'vitest';
import crypto from 'node:crypto';
import type { EncryptionService } from '@/lib/encryption';
import { createEncryptionService, getMasterKey } from '@/lib/encryption';

// --- テスト用ヘルパー ---

/** テスト用の256bit マスターキーを生成 */
function generateTestKey(): Buffer {
  return crypto.randomBytes(32);
}

describe('AES-256-GCM 暗号化', () => {
  let service: EncryptionService;
  let masterKey: Buffer;

  beforeEach(() => {
    service = createEncryptionService();
    masterKey = generateTestKey();
  });

  describe('正常系', () => {
    it('平文を暗号化して正しく復号できる', () => {
      const plaintext = 'my-secret-password-123';
      const encrypted = service.encrypt(plaintext, masterKey);
      const decrypted = service.decrypt(encrypted, masterKey);
      expect(decrypted).toBe(plaintext);
    });

    it('日本語文字列を正しく暗号化・復号できる', () => {
      const plaintext = '千葉工業大学のパスワード';
      const encrypted = service.encrypt(plaintext, masterKey);
      const decrypted = service.decrypt(encrypted, masterKey);
      expect(decrypted).toBe(plaintext);
    });

    it('特殊文字を含む文字列を正しく処理できる', () => {
      const plaintext = 'p@$$w0rd!#%^&*()_+-=[]{}|;:,.<>?';
      const encrypted = service.encrypt(plaintext, masterKey);
      const decrypted = service.decrypt(encrypted, masterKey);
      expect(decrypted).toBe(plaintext);
    });

    it('空文字列を暗号化・復号できる', () => {
      const plaintext = '';
      const encrypted = service.encrypt(plaintext, masterKey);
      const decrypted = service.decrypt(encrypted, masterKey);
      expect(decrypted).toBe(plaintext);
    });

    it('長大な文字列（10KB）を暗号化・復号できる', () => {
      const plaintext = 'A'.repeat(10240);
      const encrypted = service.encrypt(plaintext, masterKey);
      const decrypted = service.decrypt(encrypted, masterKey);
      expect(decrypted).toBe(plaintext);
    });
  });

  describe('IV（初期化ベクトル）の一意性', () => {
    it('同じ平文を暗号化しても毎回異なるIVが生成される', () => {
      const plaintext = 'same-plaintext';
      const encrypted1 = service.encrypt(plaintext, masterKey);
      const encrypted2 = service.encrypt(plaintext, masterKey);
      expect(encrypted1.iv).not.toBe(encrypted2.iv);
    });

    it('同じ平文・同じキーでも毎回異なる暗号文が生成される', () => {
      const plaintext = 'same-plaintext';
      const encrypted1 = service.encrypt(plaintext, masterKey);
      const encrypted2 = service.encrypt(plaintext, masterKey);
      expect(encrypted1.ciphertext).not.toBe(encrypted2.ciphertext);
    });

    it('IVは96bit（12バイト）である', () => {
      const encrypted = service.encrypt('test', masterKey);
      const ivBytes = Buffer.from(encrypted.iv, 'base64');
      expect(ivBytes.length).toBe(12);
    });
  });

  describe('平文の漏洩防止', () => {
    it('暗号文に平文がそのまま含まれない', () => {
      const plaintext = 'super-secret-credential';
      const encrypted = service.encrypt(plaintext, masterKey);
      const ciphertextDecoded = Buffer.from(encrypted.ciphertext, 'base64').toString('utf8');
      expect(ciphertextDecoded).not.toContain(plaintext);
    });

    it('Base64エンコードされた暗号文に平文が含まれない', () => {
      const plaintext = 'password123';
      const encrypted = service.encrypt(plaintext, masterKey);
      expect(encrypted.ciphertext).not.toContain(plaintext);
      expect(encrypted.iv).not.toContain(plaintext);
      expect(encrypted.authTag).not.toContain(plaintext);
    });
  });

  describe('改ざん検知（GCM認証タグ）', () => {
    it('暗号文が改ざんされた場合、復号に失敗する', () => {
      const encrypted = service.encrypt('secret', masterKey);
      const tampered = { ...encrypted };
      // 暗号文の1バイトを変更
      const buf = Buffer.from(tampered.ciphertext, 'base64');
      buf[0] = buf[0]! ^ 0xff;
      tampered.ciphertext = buf.toString('base64');

      expect(() => service.decrypt(tampered, masterKey)).toThrow();
    });

    it('認証タグが改ざんされた場合、復号に失敗する', () => {
      const encrypted = service.encrypt('secret', masterKey);
      const tampered = { ...encrypted };
      const buf = Buffer.from(tampered.authTag, 'base64');
      buf[0] = buf[0]! ^ 0xff;
      tampered.authTag = buf.toString('base64');

      expect(() => service.decrypt(tampered, masterKey)).toThrow();
    });

    it('IVが改ざんされた場合、復号に失敗する', () => {
      const encrypted = service.encrypt('secret', masterKey);
      const tampered = { ...encrypted };
      const buf = Buffer.from(tampered.iv, 'base64');
      buf[0] = buf[0]! ^ 0xff;
      tampered.iv = buf.toString('base64');

      expect(() => service.decrypt(tampered, masterKey)).toThrow();
    });
  });

  describe('不正なキーでの復号', () => {
    it('異なるマスターキーでは復号できない', () => {
      const encrypted = service.encrypt('secret', masterKey);
      const wrongKey = generateTestKey();
      expect(() => service.decrypt(encrypted, wrongKey)).toThrow();
    });

    it('キーの1ビットが異なるだけでも復号できない', () => {
      const encrypted = service.encrypt('secret', masterKey);
      const almostKey = Buffer.from(masterKey);
      almostKey[0] = almostKey[0]! ^ 0x01; // 1ビットだけ変更
      expect(() => service.decrypt(encrypted, almostKey)).toThrow();
    });
  });

  describe('マスターキーの取得', () => {
    it('ENCRYPTION_MASTER_KEY が未設定の場合エラーを投げる', () => {
      delete process.env.ENCRYPTION_MASTER_KEY;
      expect(() => getMasterKey()).toThrow('ENCRYPTION_MASTER_KEY is not set');
    });

    it('キーが32バイト未満の場合エラーを投げる', () => {
      process.env.ENCRYPTION_MASTER_KEY = 'aabbccdd'; // 4バイト
      expect(() => getMasterKey()).toThrow('must be 256 bits');
    });

    it('正しい64文字のHex文字列から32バイトのキーを取得できる', () => {
      const key = crypto.randomBytes(32);
      process.env.ENCRYPTION_MASTER_KEY = key.toString('hex');
      const result = getMasterKey();
      expect(result.length).toBe(32);
      expect(result.equals(key)).toBe(true);
    });
  });
});
