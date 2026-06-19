/**
 * createAttendanceAdapter の mock トグルのテスト
 *
 * WHY: ローカル検証用の ATTENDANCE_ADAPTER=mock seam が、非 production でだけ mock を返し、
 * production では throw して本番混入を防ぐことを固定する。既定は HTTP アダプタ。
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { createAttendanceAdapter } from '../../src/scrapers/adapter-factory';
import { MockAttendanceAdapter } from '../../src/scrapers/adapters/attendance-mock';
import { AttendanceHttpAdapter } from '../../src/scrapers/adapters/attendance-http';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('createAttendanceAdapter', () => {
  it('既定 (ATTENDANCE_ADAPTER 未設定) は HTTP アダプタ', () => {
    vi.stubEnv('ATTENDANCE_ADAPTER', '');
    const adapter = createAttendanceAdapter();
    expect(adapter).toBeInstanceOf(AttendanceHttpAdapter);
    expect(adapter.name).toBe('http');
  });

  it('ATTENDANCE_ADAPTER=mock (非 production) は mock アダプタ', () => {
    vi.stubEnv('ATTENDANCE_ADAPTER', 'mock');
    vi.stubEnv('NODE_ENV', 'development');
    const adapter = createAttendanceAdapter();
    expect(adapter).toBeInstanceOf(MockAttendanceAdapter);
    expect(adapter.name).toBe('mock');
  });

  it('production で mock 指定は throw する (本番混入ガード)', () => {
    vi.stubEnv('ATTENDANCE_ADAPTER', 'mock');
    vi.stubEnv('NODE_ENV', 'production');
    expect(() => createAttendanceAdapter()).toThrow(/not allowed in production/);
  });
});
