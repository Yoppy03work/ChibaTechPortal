/**
 * auto 段階解禁フラグのテスト
 *
 * WHY: auto は最高リスク。フラグは fail-closed（既定で無効・空 allowlist は誰も許可しない）
 * であることを固定する。
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  isAutoExecutionEnabled,
  isUserAllowlisted,
  isAutoDryRun,
} from '../../src/lib/attendance-rollout';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('isAutoExecutionEnabled', () => {
  it('未設定なら false', () => {
    expect(isAutoExecutionEnabled()).toBe(false);
  });
  it("'true' のときだけ true", () => {
    vi.stubEnv('ATTENDANCE_AUTO_EXECUTION_ENABLED', 'true');
    expect(isAutoExecutionEnabled()).toBe(true);
    vi.stubEnv('ATTENDANCE_AUTO_EXECUTION_ENABLED', '1');
    expect(isAutoExecutionEnabled()).toBe(false);
  });
});

describe('isUserAllowlisted (fail-closed)', () => {
  it('allowlist 未設定なら誰も許可しない', () => {
    expect(isUserAllowlisted('u1')).toBe(false);
  });
  it('allowlist に含まれる userId のみ true', () => {
    vi.stubEnv('ATTENDANCE_AUTO_ALLOWLIST', 'u1, u2');
    expect(isUserAllowlisted('u1')).toBe(true);
    expect(isUserAllowlisted('u2')).toBe(true);
    expect(isUserAllowlisted('u3')).toBe(false);
  });
  it('ATTENDANCE_AUTO_ALLOWLIST_ALL=true なら全員許可 (明示 opt-in)', () => {
    vi.stubEnv('ATTENDANCE_AUTO_ALLOWLIST_ALL', 'true');
    expect(isUserAllowlisted('any')).toBe(true);
  });
});

describe('isAutoDryRun', () => {
  it('未設定なら false', () => {
    expect(isAutoDryRun()).toBe(false);
  });
  it("'true' のときだけ true", () => {
    vi.stubEnv('ATTENDANCE_AUTO_DRY_RUN', 'true');
    expect(isAutoDryRun()).toBe(true);
  });
});
