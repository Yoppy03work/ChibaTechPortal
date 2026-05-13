/**
 * 「今これから出席する授業」を時間割から特定する utility
 *
 * WHY: confirm モードで QR を読んだ瞬間に、その時刻に該当する授業を
 * 自動で対象として提示する。auto-guard と同じ時刻ウィンドウ (授業開始
 * 5 分前 ± 2 分の許容幅) を流用し、Worker 側のガード判定と一貫させる。
 *
 * 対象が複数ある (時間割が壊れている等) 場合は判定を保留し、UI で選択を
 * 仰ぐ。対象が見つからない場合も同様に「未特定」を返し、ユーザーに
 * 手動選択させる。
 */

export interface AttendanceTargetTimetable {
  id: string;
  dayOfWeek: number; // 0=日, ..., 6=土
  period: number; // 1〜6 限
  className: string;
  room?: string | null;
}

export type AttendanceTargetResolution =
  | { kind: 'unique'; timetable: AttendanceTargetTimetable }
  | { kind: 'none' }
  | { kind: 'ambiguous'; candidates: AttendanceTargetTimetable[] };

const PERIOD_START_TIMES: Record<number, { hour: number; minute: number }> = {
  1: { hour: 9, minute: 30 },
  2: { hour: 11, minute: 10 },
  3: { hour: 13, minute: 10 },
  4: { hour: 14, minute: 50 },
  5: { hour: 16, minute: 30 },
  6: { hour: 18, minute: 10 },
};

// WHY: auto-guard と一貫させる。授業開始 5 分前 ± 2 分の許容幅を採用
const ATTENDANCE_LEAD_MINUTES = 5;
const ATTENDANCE_WINDOW_TOLERANCE_MINUTES = 2;

function isInAttendanceWindow(
  now: Date,
  dayOfWeek: number,
  period: number
): boolean {
  if (now.getDay() !== dayOfWeek) return false;
  const start = PERIOD_START_TIMES[period];
  if (!start) return false;
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const targetMinutes = start.hour * 60 + start.minute - ATTENDANCE_LEAD_MINUTES;
  return Math.abs(currentMinutes - targetMinutes) <= ATTENDANCE_WINDOW_TOLERANCE_MINUTES;
}

/**
 * 時間割の中から「今出席するべき授業」を特定する。
 *
 * - 対象 1 件: { kind: 'unique', timetable }
 * - 対象 0 件: { kind: 'none' } (時間外 / その曜日に授業がない)
 * - 対象 2 件以上: { kind: 'ambiguous', candidates } (時間割の重複 / 同時限重複など)
 */
export function resolveAttendanceTarget(
  timetables: readonly AttendanceTargetTimetable[],
  now: Date
): AttendanceTargetResolution {
  const candidates = timetables.filter((tt) =>
    isInAttendanceWindow(now, tt.dayOfWeek, tt.period)
  );

  if (candidates.length === 0) return { kind: 'none' };
  if (candidates.length === 1) return { kind: 'unique', timetable: candidates[0] };
  return { kind: 'ambiguous', candidates };
}
