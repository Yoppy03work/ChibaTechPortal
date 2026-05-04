/**
 * attendance-settings の正規化・後方互換テスト
 */
import { describe, it, expect } from 'vitest';
import {
  normalizeAttendanceSettings,
  attendanceSettingsSchema,
  DEFAULT_ATTENDANCE_MODE,
} from '../src/lib/attendance-settings';

describe('normalizeAttendanceSettings', () => {
  describe('新形式 { mode } をそのまま受け入れる', () => {
    it.each(['manual', 'confirm', 'auto'] as const)('mode=%s', (mode) => {
      expect(normalizeAttendanceSettings({ mode })).toEqual({ mode });
    });
  });

  describe('旧形式 { autoAttend } を変換する', () => {
    it('autoAttend=true → mode=auto', () => {
      expect(normalizeAttendanceSettings({ autoAttend: true })).toEqual({ mode: 'auto' });
    });

    it('autoAttend=false → mode=デフォルト', () => {
      expect(normalizeAttendanceSettings({ autoAttend: false })).toEqual({
        mode: DEFAULT_ATTENDANCE_MODE,
      });
    });

    it('autoAttend=null → mode=デフォルト', () => {
      expect(normalizeAttendanceSettings({ autoAttend: null })).toEqual({
        mode: DEFAULT_ATTENDANCE_MODE,
      });
    });

    it('autoAttend=undefined → mode=デフォルト', () => {
      expect(normalizeAttendanceSettings({ autoAttend: undefined })).toEqual({
        mode: DEFAULT_ATTENDANCE_MODE,
      });
    });
  });

  describe('null / undefined / 不正値はデフォルトに倒す', () => {
    it.each([null, undefined, {}, [], 0, 'string', { mode: 'invalid' }, { mode: 123 }])(
      'input=%s',
      (raw) => {
        expect(normalizeAttendanceSettings(raw)).toEqual({ mode: DEFAULT_ATTENDANCE_MODE });
      }
    );
  });

  describe('優先順位', () => {
    it('新形式が優先される（mode と autoAttend 両方ある場合）', () => {
      // WHY: 新形式に切り替わった後の DB 行に旧フィールドが残っていてもクリーンに扱う
      expect(
        normalizeAttendanceSettings({ mode: 'manual', autoAttend: true })
      ).toEqual({ mode: 'manual' });
    });

    it('mode が不正なら旧形式 autoAttend にフォールバック', () => {
      expect(
        normalizeAttendanceSettings({ mode: 'invalid', autoAttend: true })
      ).toEqual({ mode: 'auto' });
    });
  });

  it('throw しない（壊れた DB 行で起動失敗を避ける）', () => {
    // WHY: JSON カラムに想定外の値が入っていてもアプリは起動を続ける
    expect(() => normalizeAttendanceSettings(NaN)).not.toThrow();
    expect(() => normalizeAttendanceSettings(Symbol('x'))).not.toThrow();
  });
});

describe('attendanceSettingsSchema', () => {
  it('valid 3 modes', () => {
    for (const mode of ['manual', 'confirm', 'auto'] as const) {
      expect(attendanceSettingsSchema.safeParse({ mode }).success).toBe(true);
    }
  });

  it('未知の mode は reject', () => {
    expect(attendanceSettingsSchema.safeParse({ mode: 'unknown' }).success).toBe(false);
    expect(attendanceSettingsSchema.safeParse({}).success).toBe(false);
  });

  it('DEFAULT_ATTENDANCE_MODE は confirm', () => {
    // WHY: デフォルト値は外向きの安全側（半自動）。auto を選ばせない安全装置の起点
    expect(DEFAULT_ATTENDANCE_MODE).toBe('confirm');
  });
});
