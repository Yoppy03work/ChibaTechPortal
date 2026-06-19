/**
 * summarizeAttendance のテスト
 */
import { describe, it, expect } from 'vitest';
import { summarizeAttendance } from '../src/lib/attendance-summary';

function log(status: string, method: string, className: string) {
  return { status, method, className };
}

describe('summarizeAttendance', () => {
  it('空配列はゼロ集計・成功率 0', () => {
    expect(summarizeAttendance([])).toEqual({
      total: 0,
      success: 0,
      failed: 0,
      skipped: 0,
      successRate: 0,
      byMethod: { auto: 0, confirm: 0, manual: 0, other: 0 },
      byClass: [],
    });
  });

  it('status/method/授業別に集計し、成功率 = success/(success+failed)', () => {
    const s = summarizeAttendance([
      log('success', 'confirm', 'A'),
      log('success', 'auto', 'A'),
      log('failed', 'confirm', 'A'),
      log('skipped', 'auto', 'B'),
      log('success', 'manual', 'B'),
    ]);
    expect(s.total).toBe(5);
    expect(s.success).toBe(3);
    expect(s.failed).toBe(1);
    expect(s.skipped).toBe(1);
    // skipped は分母に含めない: 3/(3+1)=0.75
    expect(s.successRate).toBeCloseTo(0.75);
    expect(s.byMethod).toEqual({ auto: 2, confirm: 2, manual: 1, other: 0 });
    expect(s.byClass).toEqual([
      { className: 'A', total: 3, success: 2 },
      { className: 'B', total: 2, success: 1 },
    ]);
  });

  it('未知の method は other に集計', () => {
    const s = summarizeAttendance([log('success', 'qr-learn', 'A')]);
    expect(s.byMethod.other).toBe(1);
  });

  it('success/failed が無ければ成功率 0 (skipped のみ)', () => {
    expect(summarizeAttendance([log('skipped', 'auto', 'A')]).successRate).toBe(0);
  });
});
