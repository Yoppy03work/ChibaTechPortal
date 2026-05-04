/**
 * 出席 auto 実行の最終ゲート。
 *
 * WHY: Scheduler 側の投入制御だけだと、別経路から BullMQ にジョブが入った場合に
 * 自動送信を防げない。Worker 入口でも同じ条件を純粋関数で判定し、条件不足なら
 * adapter.attend() に到達させない。
 */
import type { AttendanceMode } from './scraper-adapter';

export interface AttendanceAutoGuardInput {
  autoExecutionEnabled: boolean;
  method: AttendanceMode;
  storedMode: AttendanceMode;
  campusReachable: boolean;
  timetableUserId: string;
  jobUserId: string;
  timetableRoom: string | null | undefined;
  jobRoomId: string;
  dayOfWeek: number;
  period: number;
  now: Date;
  alreadySubmitted: boolean;
  qrSessionValid: boolean;
}

export type AttendanceAutoGuardResult =
  | { allowed: true }
  | { allowed: false; reason: string };

const PERIOD_START_TIMES: Record<number, { hour: number; minute: number }> = {
  1: { hour: 9, minute: 30 },
  2: { hour: 11, minute: 10 },
  3: { hour: 13, minute: 10 },
  4: { hour: 14, minute: 50 },
  5: { hour: 16, minute: 30 },
  6: { hour: 18, minute: 10 },
};

const ATTENDANCE_LEAD_MINUTES = 5;

function isExpectedAttendanceWindow(input: AttendanceAutoGuardInput): boolean {
  const start = PERIOD_START_TIMES[input.period];
  if (!start) return false;

  const currentMinutes = input.now.getHours() * 60 + input.now.getMinutes();
  const targetMinutes = start.hour * 60 + start.minute - ATTENDANCE_LEAD_MINUTES;
  return input.now.getDay() === input.dayOfWeek && currentMinutes === targetMinutes;
}

export function evaluateAttendanceAutoGuard(
  input: AttendanceAutoGuardInput
): AttendanceAutoGuardResult {
  if (!input.autoExecutionEnabled) {
    return { allowed: false, reason: 'auto attendance execution is disabled by server policy' };
  }

  if (input.method !== 'auto') {
    return { allowed: false, reason: 'attendance worker only submits auto jobs' };
  }

  if (input.storedMode !== 'auto') {
    return { allowed: false, reason: 'user has not enabled auto attendance' };
  }

  if (input.timetableUserId !== input.jobUserId) {
    return { allowed: false, reason: 'job user does not own timetable entry' };
  }

  if (!input.timetableRoom || input.timetableRoom !== input.jobRoomId) {
    return { allowed: false, reason: 'job room does not match timetable room' };
  }

  if (!isExpectedAttendanceWindow(input)) {
    return { allowed: false, reason: 'current time does not match target class period' };
  }

  if (!input.campusReachable) {
    return { allowed: false, reason: 'attendance system is not reachable from campus network' };
  }

  if (!input.qrSessionValid) {
    return { allowed: false, reason: 'QR-derived attendance session is not verified' };
  }

  if (input.alreadySubmitted) {
    return { allowed: false, reason: 'attendance was already submitted for this class date' };
  }

  return { allowed: true };
}
