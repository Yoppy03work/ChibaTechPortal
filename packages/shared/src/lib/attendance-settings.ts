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
 *   - 旧形式 `{ autoAttend: true | false }` → `{ mode: DEFAULT }` (= confirm)
 *   - null / undefined / 不正値 → `{ mode: DEFAULT }`（throw しない）
 *
 * WHY: 旧 boolean フラグから新 3 モード設計への移行で、`autoAttend=true` の
 * 既存ユーザーを暗黙的に `mode: 'auto'` に昇格させるのは危険。
 *   - auto は 6 条件ガード + 監査ログ + 実地検証が揃った後にだけ解禁する
 *   - 旧 UI の「自動出席 ON」は新 UI の「auto」とはセマンティクスが異なる
 *     (旧は単純な boolean、新は 6 条件付きの auto)
 *   - ユーザーが明示的に 3 択 UI で auto を選んだ時だけ mode='auto' とする
 * よって旧形式は true / false どちらも DEFAULT (= confirm) に倒す。auto を
 * 選び直したいユーザーは新 UI で再選択する (現状は disabled 表示)。
 */
export function normalizeAttendanceSettings(raw: unknown): AttendanceSettings {
  // 1. 新形式として通るか
  const parsedNew = attendanceSettingsSchema.safeParse(raw);
  if (parsedNew.success) {
    return parsedNew.data;
  }

  // 2. 旧形式 { autoAttend: boolean } は true / false どちらも DEFAULT に倒す
  // WHY: 暗黙の auto 昇格を防ぐため、true でも DEFAULT (confirm) に統一する
  if (raw && typeof raw === 'object' && 'autoAttend' in raw) {
    return { mode: DEFAULT_ATTENDANCE_MODE };
  }

  // 3. null / undefined / 不正値 → デフォルト
  return { mode: DEFAULT_ATTENDANCE_MODE };
}
