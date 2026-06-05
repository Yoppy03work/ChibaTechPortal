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

// WHY: 千葉工大の授業時刻は JST 固定。Worker / Web のコンテナ TZ
// (Dockerfile/compose で TZ 未指定なら UTC) に依存して `now.getHours()` を使うと、
// 1 限 09:25 JST 送信が UTC 00:25 として `outside_time_window` で reject される。
// Intl.DateTimeFormat で Asia/Tokyo に正規化してから時/分/曜日を取り出す。
const JST_PARTS_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Tokyo',
  hour12: false,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  weekday: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

const DAY_OF_WEEK_MAP: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

function getJstParts(date: Date): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  dayOfWeek: number;
} {
  const parts = JST_PARTS_FORMATTER.formatToParts(date);
  const pick = (type: string) =>
    parts.find((p) => p.type === type)?.value ?? '';
  // WHY: Intl は en-US で hour: '2-digit' / hour12: false にすると "24" を
  // 真夜中で返す実装がある (Chrome/Node の挙動)。% 24 で 0 に正規化する。
  const rawHour = parseInt(pick('hour'), 10);
  return {
    year: parseInt(pick('year'), 10),
    month: parseInt(pick('month'), 10),
    day: parseInt(pick('day'), 10),
    hour: rawHour % 24,
    minute: parseInt(pick('minute'), 10),
    dayOfWeek: DAY_OF_WEEK_MAP[pick('weekday')] ?? 0,
  };
}

function isInAttendanceWindow(
  now: Date,
  dayOfWeek: number,
  period: number
): boolean {
  const jst = getJstParts(now);
  if (jst.dayOfWeek !== dayOfWeek) return false;
  const start = PERIOD_START_TIMES[period];
  if (!start) return false;
  const currentMinutes = jst.hour * 60 + jst.minute;
  const targetMinutes = start.hour * 60 + start.minute - ATTENDANCE_LEAD_MINUTES;
  return Math.abs(currentMinutes - targetMinutes) <= ATTENDANCE_WINDOW_TOLERANCE_MINUTES;
}

function isSameDate(a: Date, b: Date): boolean {
  // WHY: 両方とも JST のカレンダー日で比較。コンテナ TZ に依存して別日と
  // 判定されるのを防ぐ。
  const ja = getJstParts(a);
  const jb = getJstParts(b);
  return ja.year === jb.year && ja.month === jb.month && ja.day === jb.day;
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
