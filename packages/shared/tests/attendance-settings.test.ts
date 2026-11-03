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
  describe('新形式 { mode } をそのまま受け入れる (autoUnlocked は既定 false)', () => {
    it.each(['manual', 'confirm', 'auto'] as const)('mode=%s', (mode) => {
      expect(normalizeAttendanceSettings({ mode })).toEqual({ mode, autoUnlocked: false });
    });
  });

  describe('autoUnlocked の扱い (fail-closed)', () => {
    it('mode=auto + autoUnlocked=true はそのまま解禁済みで返す', () => {
      expect(normalizeAttendanceSettings({ mode: 'auto', autoUnlocked: true })).toEqual({
        mode: 'auto',
        autoUnlocked: true,
      });
    });

    it('mode=auto + autoUnlocked 未指定は false', () => {
      expect(normalizeAttendanceSettings({ mode: 'auto' })).toEqual({
        mode: 'auto',
        autoUnlocked: false,
      });
    });

    it('mode!==auto なら autoUnlocked=true でも false に倒す (暗黙解禁させない)', () => {
      // WHY: 壊れた行 (mode=confirm なのに autoUnlocked=true) で auto 実行が起きないよう、
      // autoUnlocked は mode==='auto' のときだけ意味を持つ (二重の fail-closed)。
      expect(normalizeAttendanceSettings({ mode: 'confirm', autoUnlocked: true })).toEqual({
        mode: 'confirm',
        autoUnlocked: false,
      });
      expect(normalizeAttendanceSettings({ mode: 'manual', autoUnlocked: true })).toEqual({
        mode: 'manual',
        autoUnlocked: false,
      });
    });
  });

  describe('旧形式 { autoAttend } は true/false どちらもデフォルト (confirm・未解禁) に倒す', () => {
    // WHY: 旧 boolean フラグから新 3 モード設計へ移行する際、autoAttend=true の
    // ユーザーを暗黙的に mode='auto' へ昇格させない。安全側 (confirm) に倒す。
    it.each([true, false, null, undefined])('autoAttend=%s → デフォルト', (autoAttend) => {
      expect(normalizeAttendanceSettings({ autoAttend })).toEqual({
        mode: DEFAULT_ATTENDANCE_MODE,
        autoUnlocked: false,
      });
    });
  });

  describe('null / undefined / 不正値はデフォルトに倒す', () => {
    it.each([null, undefined, {}, [], 0, 'string', { mode: 'invalid' }, { mode: 123 }])(
      'input=%s',
      (raw) => {
        expect(normalizeAttendanceSettings(raw)).toEqual({
          mode: DEFAULT_ATTENDANCE_MODE,
          autoUnlocked: false,
        });
      }
    );
  });

  describe('優先順位', () => {
    it('新形式が優先される（mode と autoAttend 両方ある場合）', () => {
      // WHY: 新形式に切り替わった後の DB 行に旧フィールドが残っていてもクリーンに扱う
      expect(
        normalizeAttendanceSettings({ mode: 'manual', autoAttend: true })
      ).toEqual({ mode: 'manual', autoUnlocked: false });
    });

    it('mode が不正なら旧形式 autoAttend にフォールバックし、true でもデフォルトに倒す', () => {
      expect(
        normalizeAttendanceSettings({ mode: 'invalid', autoAttend: true })
      ).toEqual({ mode: DEFAULT_ATTENDANCE_MODE, autoUnlocked: false });
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
