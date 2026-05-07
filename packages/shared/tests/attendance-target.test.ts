/**
 * 対象授業判定のテスト
 *
 * WHY: confirm モードの「今これから出席する授業」自動特定の挙動を固定する。
 * 時間ウィンドウは auto-guard と一貫させているため、判定基準のズレを許さない。
 */
import { describe, expect, it } from 'vitest';
import {
  resolveAttendanceTarget,
  type AttendanceTargetTimetable,
} from '../src/lib/attendance-target';

const SAMPLE: AttendanceTargetTimetable[] = [
  { id: 'tt-mon-1', dayOfWeek: 1, period: 1, className: '線形代数', room: '8109' },
  { id: 'tt-mon-2', dayOfWeek: 1, period: 2, className: '英語', room: '8110' },
  { id: 'tt-tue-1', dayOfWeek: 2, period: 1, className: 'プログラミング', room: 'A-101' },
];

describe('resolveAttendanceTarget', () => {
  it('時間ウィンドウ内 (1限 9:25 月曜) で unique 判定する', () => {
    // WHY: 1 限は 9:30 開始 - 5 分 = 9:25 がターゲット。±2 分許容
    const now = new Date(2026, 4, 4, 9, 25, 0); // 月曜
    const result = resolveAttendanceTarget(SAMPLE, now);
    expect(result.kind).toBe('unique');
    if (result.kind === 'unique') {
      expect(result.timetable.id).toBe('tt-mon-1');
    }
  });

  it('境界 (±2 分) でも unique 判定する', () => {
    const now = new Date(2026, 4, 4, 9, 27, 0); // 月曜 9:27 (+2)
    const result = resolveAttendanceTarget(SAMPLE, now);
    expect(result.kind).toBe('unique');
  });

  it('時間ウィンドウ外なら none', () => {
    const now = new Date(2026, 4, 4, 10, 30, 0); // 月曜 10:30 (どの限のターゲットでもない)
    const result = resolveAttendanceTarget(SAMPLE, now);
    expect(result.kind).toBe('none');
  });

  it('該当曜日に授業がなければ none', () => {
    const now = new Date(2026, 4, 6, 9, 25, 0); // 水曜 9:25
    const result = resolveAttendanceTarget(SAMPLE, now);
    expect(result.kind).toBe('none');
  });

  it('同曜日同時限が複数あれば ambiguous', () => {
    const duplicated: AttendanceTargetTimetable[] = [
      ...SAMPLE,
      { id: 'tt-mon-1-dup', dayOfWeek: 1, period: 1, className: '体育', room: 'GYM' },
    ];
    const now = new Date(2026, 4, 4, 9, 25, 0);
    const result = resolveAttendanceTarget(duplicated, now);
    expect(result.kind).toBe('ambiguous');
    if (result.kind === 'ambiguous') {
      expect(result.candidates.map((c) => c.id).sort()).toEqual(
        ['tt-mon-1', 'tt-mon-1-dup'].sort()
      );
    }
  });

  it('未定義の限 (period=99) は none', () => {
    const odd: AttendanceTargetTimetable[] = [
      { id: 'tt-x', dayOfWeek: 1, period: 99, className: 'X', room: null },
    ];
    const now = new Date(2026, 4, 4, 9, 25, 0);
    const result = resolveAttendanceTarget(odd, now);
    expect(result.kind).toBe('none');
  });

  it('±3 分超過は範囲外', () => {
    const now = new Date(2026, 4, 4, 9, 22, 0); // 1 限ターゲット 9:25 - 3 分
    const result = resolveAttendanceTarget(SAMPLE, now);
    expect(result.kind).toBe('none');
  });
});
