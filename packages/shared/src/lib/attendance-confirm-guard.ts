/**
 * 出席 confirm 送信のガード（純粋関数）
 *
 * WHY: confirm モードは「ユーザーが UI で意図を確認した後の送信」だが、
 * API 入力をそのまま信用すると、フロントの検証バイパス（直接 POST など）で
 * 不正な submit が通る。サーバー側と Worker 入口の両方で同じ guard を通し、
 * 二重防衛にする。auto-guard と guard 内容が違うため別関数として定義する:
 *
 *   - auto-guard: qrSessionValid / 6 条件（時刻 ±2 分 / mode='auto' 必須など）
 *   - confirm-guard: room 一致 / 時刻ウィンドウ / 重複なし / creds 有り / 所有確認
 *
 * confirm では qrSessionValid 相当の「ユーザー意図」は API 入力
 * (timetableId + roomId + classDate) を本人が UI で確認したことで代用する。
 */
import type { AttendanceMode } from './scraper-adapter';

export interface ConfirmSubmitGuardInput {
  // --- API 入力 ---
  jobUserId: string;
  jobTimetableId: string;
  jobRoomId: string;
  jobClassDate: Date;
  // --- DB 検証結果 ---
  timetableUserId: string;
  timetableRoom: string | null | undefined;
  timetableDayOfWeek: number;
  timetablePeriod: number;
  alreadySubmittedConfirm: boolean;
  hasCitCreds: boolean;
  // --- 現在時刻 ---
  now: Date;
}

export type ConfirmSubmitGuardResult =
  | { allowed: true }
  | {
      allowed: false;
      reason:
        | 'timetable_not_owned'
        | 'room_mismatch'
        | 'outside_time_window'
        | 'already_submitted'
        | 'credentials_not_registered'
        | 'class_date_mismatch';
    };

const PERIOD_START_TIMES: Record<number, { hour: number; minute: number }> = {
  1: { hour: 9, minute: 30 },
  2: { hour: 11, minute: 10 },
  3: { hour: 13, minute: 10 },
  4: { hour: 14, minute: 50 },
  5: { hour: 16, minute: 30 },
  6: { hour: 18, minute: 10 },
};

// WHY: auto-guard / resolveAttendanceTarget と同じ ±2 分の許容幅
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

function isSameDate(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * confirm 送信を許可するか判定する。
 *
 * チェック順 (失敗時は最初の reason を返す):
 *   1. timetable の所有確認 (timetableUserId === jobUserId)
 *   2. 教室一致 (timetableRoom === jobRoomId)
 *   3. classDate の妥当性 (今日 === jobClassDate)
 *   4. 時刻ウィンドウ (授業開始 5 分前 ±2 分)
 *   5. 同日 confirm 重複なし (alreadySubmittedConfirm === false)
 *   6. 認証情報あり (hasCitCreds === true)
 */
export function evaluateConfirmSubmitGuard(
  input: ConfirmSubmitGuardInput
): ConfirmSubmitGuardResult {
  if (input.timetableUserId !== input.jobUserId) {
    return { allowed: false, reason: 'timetable_not_owned' };
  }

  if (!input.timetableRoom || input.timetableRoom !== input.jobRoomId) {
    return { allowed: false, reason: 'room_mismatch' };
  }

  // WHY: classDate (ユーザー入力) と現在日付の整合性チェック。
  // 過去日・未来日の API 直叩きで「特定授業に対して別日に出席登録」を
  // 偽装する経路を塞ぐ
  if (!isSameDate(input.jobClassDate, input.now)) {
    return { allowed: false, reason: 'class_date_mismatch' };
  }

  if (
    !isInAttendanceWindow(
      input.now,
      input.timetableDayOfWeek,
      input.timetablePeriod
    )
  ) {
    return { allowed: false, reason: 'outside_time_window' };
  }

  if (input.alreadySubmittedConfirm) {
    return { allowed: false, reason: 'already_submitted' };
  }

  if (!input.hasCitCreds) {
    return { allowed: false, reason: 'credentials_not_registered' };
  }

  return { allowed: true };
}

/**
 * confirm submit API / Worker の入力 zod schema 用の method 定数。
 * 既存の AttendanceMode と整合させる。
 */
export const CONFIRM_METHOD: AttendanceMode = 'confirm';
