/**
 * auto 解禁（開発者コード方式）と dry-run のテスト
 *
 * WHY: auto は最高リスク。開発者コード未設定なら永久にロック（fail-closed）、
 * dry-run は安全側（送らない）に倒す、を固定する。
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  isAutoDevCodeConfigured,
  verifyAutoDevCode,
  isAutoDryRun,
} from '../src/lib/attendance-rollout';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('auto 開発者コード (fail-closed)', () => {
  it('未設定なら解禁不可 (configured=false, verify は常に false)', () => {
    expect(isAutoDevCodeConfigured()).toBe(false);
    expect(verifyAutoDevCode('anything')).toBe(false);
    expect(verifyAutoDevCode('')).toBe(false);
  });

  it('設定済みなら完全一致のときだけ true', () => {
    vi.stubEnv('ATTENDANCE_AUTO_DEV_CODE', 's3cret-dev-code');
    expect(isAutoDevCodeConfigured()).toBe(true);
    expect(verifyAutoDevCode('s3cret-dev-code')).toBe(true);
    expect(verifyAutoDevCode('wrong')).toBe(false);
    expect(verifyAutoDevCode('s3cret-dev-cod')).toBe(false);
  });

  it('空白のみのコードは未設定扱い', () => {
    vi.stubEnv('ATTENDANCE_AUTO_DEV_CODE', '   ');
    expect(isAutoDevCodeConfigured()).toBe(false);
    expect(verifyAutoDevCode('   ')).toBe(false);
  });
});

describe('isAutoDryRun (fail-toward-dry-run)', () => {
  it('未設定なら false (= 実送信。autoUnlocked が前提)', () => {
    expect(isAutoDryRun()).toBe(false);
  });
  it('明示的な false/0/no は実送信 (opt-out)', () => {
    for (const v of ['false', '0', 'NO']) {
      vi.stubEnv('ATTENDANCE_AUTO_DRY_RUN', v);
      expect(isAutoDryRun()).toBe(false);
    }
  });
  it('それ以外 (true/1/yes/typo) は全て dry-run に倒す', () => {
    for (const v of ['true', '1', 'yes', 'tru']) {
      vi.stubEnv('ATTENDANCE_AUTO_DRY_RUN', v);
      expect(isAutoDryRun()).toBe(true);
    }
  });
});
