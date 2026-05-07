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

  describe('旧形式 { autoAttend } は true/false どちらもデフォルト (confirm) に倒す', () => {
    // WHY: 旧 boolean フラグから新 3 モード設計へ移行する際、autoAttend=true の
    // ユーザーを暗黙的に mode='auto' へ昇格させない。auto は 6 条件ガード前提で、
    // 旧 UI の「自動出席 ON」とはセマンティクスが異なる。安全側 (confirm) に倒し、
    // auto を選び直したいユーザーは新 UI で明示的に選択する (現状は disabled)。
    it('autoAttend=true → mode=デフォルト (auto に昇格させない)', () => {
      expect(normalizeAttendanceSettings({ autoAttend: true })).toEqual({
        mode: DEFAULT_ATTENDANCE_MODE,
      });
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

    it('mode が不正なら旧形式 autoAttend にフォールバックし、true でもデフォルトに倒す', () => {
      // WHY: autoAttend=true 経路でも mode='auto' に暗黙昇格させないルールは、
      // mode が不正値で fallback する場合も同じく適用する
      expect(
        normalizeAttendanceSettings({ mode: 'invalid', autoAttend: true })
      ).toEqual({ mode: DEFAULT_ATTENDANCE_MODE });
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
