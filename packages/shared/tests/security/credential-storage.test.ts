/**
 * 暗号化データベース保存テスト
 *
 * 認証情報がDBに平文で保存されないこと、マスターキーの分離管理、
 * 復号後のメモリ破棄パターンをテストする。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import crypto from 'node:crypto';
import type { EncryptedData, EncryptionService } from '@/lib/encryption';
import { createEncryptionService } from '@/lib/encryption';
import { InMemoryCredentialStore } from '@/lib/credential-store';

describe('認証情報のDB保存', () => {
  let store: InMemoryCredentialStore;
  let service: EncryptionService;
  let masterKey: Buffer;

  const testCitPassword = 'cit-portal-password-123';
  const testManabaPassword = 'manaba-secret-456';

  beforeEach(() => {
    store = new InMemoryCredentialStore();
    service = createEncryptionService();
    masterKey = crypto.randomBytes(32);
  });

  describe('平文保存の防止', () => {
    it('CIT Portal認証情報が平文でDBに保存されない', async () => {
      const encryptedCit = service.encrypt(testCitPassword, masterKey);
      const encryptedManaba = service.encrypt(testManabaPassword, masterKey);

      await store.save('user-123', encryptedCit, encryptedManaba);

      const rawData = store.getRawData();
      const row = rawData.find((r) => r.userId === 'user-123');

      expect(row).toBeDefined();
      // DBに保存されたデータに平文パスワードが含まれていないこと
      expect(row!.citPortalCreds).not.toContain(testCitPassword);
      expect(row!.manabaCreds).not.toContain(testManabaPassword);
    });

    it('DBの全カラムに平文パスワードが存在しない', async () => {
      const encryptedCit = service.encrypt(testCitPassword, masterKey);
      const encryptedManaba = service.encrypt(testManabaPassword, masterKey);

      await store.save('user-123', encryptedCit, encryptedManaba);

      const rawData = store.getRawData();
      const allValues = rawData.flatMap((row) =>
        Object.values(row).map(String)
      );

      for (const value of allValues) {
        expect(value).not.toContain(testCitPassword);
        expect(value).not.toContain(testManabaPassword);
      }
    });

    it('暗号化されたデータからマスターキーで正しく復号できる', async () => {
      const encryptedCit = service.encrypt(testCitPassword, masterKey);
      const encryptedManaba = service.encrypt(testManabaPassword, masterKey);

      await store.save('user-123', encryptedCit, encryptedManaba);

      const row = await store.get('user-123');
      expect(row).not.toBeNull();

      const citCreds: EncryptedData = JSON.parse(row!.citPortalCreds);
      const manabaCreds: EncryptedData = JSON.parse(row!.manabaCreds);

      expect(service.decrypt(citCreds, masterKey)).toBe(testCitPassword);
      expect(service.decrypt(manabaCreds, masterKey)).toBe(testManabaPassword);
    });
  });

  describe('マスターキーの分離管理', () => {
    it('マスターキーがDBデータに含まれない', async () => {
      const encryptedCit = service.encrypt(testCitPassword, masterKey);
      const encryptedManaba = service.encrypt(testManabaPassword, masterKey);

      await store.save('user-123', encryptedCit, encryptedManaba);

      const rawData = store.getRawData();
      const masterKeyHex = masterKey.toString('hex');
      const masterKeyBase64 = masterKey.toString('base64');

      for (const row of rawData) {
        const serialized = JSON.stringify(row);
        expect(serialized).not.toContain(masterKeyHex);
        expect(serialized).not.toContain(masterKeyBase64);
      }
    });

    it('異なるマスターキーでは復号できない', async () => {
      const encryptedCit = service.encrypt(testCitPassword, masterKey);
      const encryptedManaba = service.encrypt(testManabaPassword, masterKey);

      await store.save('user-123', encryptedCit, encryptedManaba);

      const row = await store.get('user-123');
      const citCreds: EncryptedData = JSON.parse(row!.citPortalCreds);

      const wrongKey = crypto.randomBytes(32);
      expect(() => service.decrypt(citCreds, wrongKey)).toThrow();
    });
  });

  describe('復号後のメモリ破棄パターン', () => {
    it('使用後にBuffer.fill(0)でメモリを上書きできる', () => {
      // WHY: 復号した平文パスワードをメモリに残さないために、
      // Buffer を使用し、使用後に0で上書きする
      const sensitiveData = Buffer.from(testCitPassword, 'utf8');

      // 使用中は読み取れる
      expect(sensitiveData.toString('utf8')).toBe(testCitPassword);

      // 使用後にゼロフィルで破棄
      sensitiveData.fill(0);

      // 破棄後は元のデータが読み取れない
      expect(sensitiveData.toString('utf8')).not.toBe(testCitPassword);
      expect(sensitiveData.every((byte) => byte === 0)).toBe(true);
    });

    it('復号→使用→破棄のライフサイクルパターン', () => {
      const encrypted = service.encrypt(testCitPassword, masterKey);

      // 復号
      const decrypted = service.decrypt(encrypted, masterKey);
      const sensitiveBuffer = Buffer.from(decrypted, 'utf8');

      // 使用（スクレイパーに渡す等）
      expect(sensitiveBuffer.toString('utf8')).toBe(testCitPassword);

      // 即座に破棄
      sensitiveBuffer.fill(0);
      expect(sensitiveBuffer.every((byte) => byte === 0)).toBe(true);
    });

    it('文字列変数は参照をnullにして破棄を促す', () => {
      const encrypted = service.encrypt(testCitPassword, masterKey);
      let decryptedStr: string | null = service.decrypt(encrypted, masterKey);

      expect(decryptedStr).toBe(testCitPassword);

      // WHY: JavaScriptの文字列はイミュータブルなので、
      // Buffer.fill(0)のような上書きはできない。
      // 参照をnullにしてGC対象にするのが現実的な対策。
      decryptedStr = null;
      expect(decryptedStr).toBeNull();
    });
  });

  describe('各ユーザーの認証情報の独立性', () => {
    it('他ユーザーの認証情報にアクセスできない', async () => {
      const key1 = crypto.randomBytes(32);
      const key2 = crypto.randomBytes(32);

      const enc1 = service.encrypt('user1-password', key1);
      const enc2 = service.encrypt('user2-password', key2);

      await store.save('user-1', enc1, service.encrypt('', key1));
      await store.save('user-2', enc2, service.encrypt('', key2));

      // user-1のデータをuser-2のキーでは復号できない
      const row1 = await store.get('user-1');
      const creds1: EncryptedData = JSON.parse(row1!.citPortalCreds);
      expect(() => service.decrypt(creds1, key2)).toThrow();
    });

    it('ユーザーごとに異なる暗号文が生成される', async () => {
      const samePassword = 'same-password';

      const enc1 = service.encrypt(samePassword, masterKey);
      const enc2 = service.encrypt(samePassword, masterKey);

      await store.save('user-1', enc1, service.encrypt('', masterKey));
      await store.save('user-2', enc2, service.encrypt('', masterKey));

      const row1 = await store.get('user-1');
      const row2 = await store.get('user-2');

      // 同じパスワードでもIVが異なるため暗号文は異なる
      expect(row1!.citPortalCreds).not.toBe(row2!.citPortalCreds);
    });
  });
});
