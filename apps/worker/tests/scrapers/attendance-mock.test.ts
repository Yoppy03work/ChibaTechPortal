/**
 * MockAttendanceAdapter のテスト
 *
 * WHY: ローカル全経路検証用の mock が healthCheck=true を返し、attend が結果を
 * ATTENDANCE_MOCK_RESULT で制御しつつ呼び出しを記録することを固定する。
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { MockAttendanceAdapter } from '../../src/scrapers/adapters/attendance-mock';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('MockAttendanceAdapter', () => {
  it('healthCheck は常に true (校外でも全経路を流す)', async () => {
    const adapter = new MockAttendanceAdapter();
    expect(await adapter.healthCheck()).toBe(true);
  });

  it('attend は既定で success を返し、呼び出しを記録する', async () => {
    const adapter = new MockAttendanceAdapter();
    const result = await adapter.attend('u1', 'pw', '8109');
    expect(result.success).toBe(true);
    expect(adapter.attendCalls).toEqual([{ userId: 'u1', roomId: '8109' }]);
  });

  it('ATTENDANCE_MOCK_RESULT=fail で success:false', async () => {
    vi.stubEnv('ATTENDANCE_MOCK_RESULT', 'fail');
    const adapter = new MockAttendanceAdapter();
    const result = await adapter.attend('u1', 'pw', '8109');
    expect(result.success).toBe(false);
    expect(adapter.attendCalls).toHaveLength(1);
  });
});
