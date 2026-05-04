/**
 * 出席設定（attendanceSettings JSON カラム）の入口
 *
 * WHY: DB の JSON カラムは型が崩れやすい。
 * GET / API / Scheduler / Page など全ての読み込み経路を `normalizeAttendanceSettings()`
 * 経由に統一することで、後方互換（旧 `{ autoAttend: boolean }`）と「壊れた値」を
 * 1 箇所で吸収する。
 *
 * 段階的解禁設計（PR1 段階）:
 *   mode を保存・送信できるようにするが、Scheduler は `mode === 'auto'` でも
 *   ジョブ投入しない（PR4 の 6 条件チェック + 監査ログ整備で解禁）。
 *   UI は auto を選択可能だが「準備中」表示で disabled に倒す。
 */
import { z } from 'zod';
import type { AttendanceMode } from './scraper-adapter';

export const attendanceModeSchema = z.enum(['manual', 'confirm', 'auto']);

/** DB に保存する attendanceSettings の正規形 */
export const attendanceSettingsSchema = z.object({
  mode: attendanceModeSchema,
});

export type AttendanceSettings = z.infer<typeof attendanceSettingsSchema>;

/** 未指定時のデフォルト。半自動（confirm）に倒すのは設計の中核。 */
export const DEFAULT_ATTENDANCE_MODE: AttendanceMode = 'confirm';

/**
 * 任意の入力を `{ mode: AttendanceMode }` に正規化する。
 *
 * 互換ルール:
 *   - 新形式 `{ mode: 'manual' | 'confirm' | 'auto' }` → そのまま返す
 *   - 旧形式 `{ autoAttend: true }` → `{ mode: 'auto' }`
 *   - 旧形式 `{ autoAttend: false }` または null/undefined → `{ mode: DEFAULT }`
 *   - 不正値・壊れた JSON → `{ mode: DEFAULT }`（throw しない）
 */
export function normalizeAttendanceSettings(raw: unknown): AttendanceSettings {
  // 1. 新形式として通るか
  const parsedNew = attendanceSettingsSchema.safeParse(raw);
  if (parsedNew.success) {
    return parsedNew.data;
  }

  // 2. 旧形式 { autoAttend: boolean } との互換
  if (raw && typeof raw === 'object' && 'autoAttend' in raw) {
    const autoAttend = (raw as { autoAttend?: unknown }).autoAttend;
    return { mode: autoAttend === true ? 'auto' : DEFAULT_ATTENDANCE_MODE };
  }

  // 3. null / undefined / 不正値 → デフォルト
  return { mode: DEFAULT_ATTENDANCE_MODE };
}
