/**
 * attendance-labels のテスト
 */
import { describe, it, expect } from 'vitest';
import {
  attendanceStatusLabel,
  attendanceMethodLabel,
} from '@/lib/attendance-labels';

describe('attendanceStatusLabel', () => {
  it('既知の status を日本語ラベルに', () => {
    expect(attendanceStatusLabel('success')).toBe('出席');
    expect(attendanceStatusLabel('failed')).toBe('失敗');
    expect(attendanceStatusLabel('skipped')).toBe('スキップ');
    expect(attendanceStatusLabel('pending')).toBe('処理中');
    expect(attendanceStatusLabel('manual')).toBe('手動');
  });
  it('未知の status はそのまま返す', () => {
    expect(attendanceStatusLabel('weird')).toBe('weird');
  });
});

describe('attendanceMethodLabel', () => {
  it('既知の method を日本語ラベルに', () => {
    expect(attendanceMethodLabel('auto')).toBe('自動');
    expect(attendanceMethodLabel('confirm')).toBe('確認');
    expect(attendanceMethodLabel('manual')).toBe('手動');
  });
  it('未知の method はそのまま返す', () => {
    expect(attendanceMethodLabel('xyz')).toBe('xyz');
  });
});
