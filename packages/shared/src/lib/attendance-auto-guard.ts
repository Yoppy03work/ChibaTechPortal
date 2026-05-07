/**
 * 出席 auto 実行の最終ゲート。
 *
 * WHY: Scheduler 側の投入制御だけだと、別経路から BullMQ にジョブが入った場合に
 * 自動送信を防げない。Worker 入口でも同じ条件を純粋関数で判定し、条件不足なら
 * adapter.attend() に到達させない。
 *
 * さらに、外部システム (出席システム) への実アクセスは `adapter.attend()` だけで
 * なく `adapter.healthCheck()` でも発生する。env disabled / qrSessionValid=false /
 * 条件不足の段階では healthCheck も呼ぶべきでないため、ガードを 2 段階に分けて:
 *   1. evaluateAttendanceAutoGuardPreNetwork — DB と内部状態だけで判定
 *   2. evaluateAttendanceAutoGuard — 上記 + campusReachable
 * とする。Worker は 1 を通過した時だけ healthCheck を呼んで 2 を評価する。
 */
import type { AttendanceMode } from './scraper-adapter';

/** Pre-network guard は campusReachable を要求しない (healthCheck 前に判定するため) */
export interface AttendanceAutoGuardPreNetworkInput {
  autoExecutionEnabled: boolean;
  method: AttendanceMode;
  storedMode: AttendanceMode;
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

export interface AttendanceAutoGuardInput extends AttendanceAutoGuardPreNetworkInput {
  campusReachable: boolean;
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

// WHY: Scheduler のキック時刻と Worker の処理時刻には数秒〜数十秒のラグがあり、
// BullMQ のリトライや遅延配送でさらにズレることがある。完全一致 (==) で判定すると
// 1 分でも遅れた瞬間に reject されてしまうため、短い許容幅を持たせる。
// 値は ATTENDANCE_LEAD_MINUTES (5 分前狙い) より十分小さく取り、授業開始
// 5 分前の前後 ±2 分 (= 7 分前 〜 3 分前の範囲) のみ許容する。
const ATTENDANCE_WINDOW_TOLERANCE_MINUTES = 2;

function isExpectedAttendanceWindow(input: AttendanceAutoGuardPreNetworkInput): boolean {
  const start = PERIOD_START_TIMES[input.period];
  if (!start) return false;

  const currentMinutes = input.now.getHours() * 60 + input.now.getMinutes();
  const targetMinutes = start.hour * 60 + start.minute - ATTENDANCE_LEAD_MINUTES;
  return (
    input.now.getDay() === input.dayOfWeek &&
    Math.abs(currentMinutes - targetMinutes) <= ATTENDANCE_WINDOW_TOLERANCE_MINUTES
  );
}

/**
 * 外部アクセス前に判定可能な条件のみを評価する。
 *
 * WHY: campusReachable は adapter.healthCheck() の戻り値で、これを取るには
 * 出席システムへ実 HTTP リクエストが発生する。env disabled / mode 不一致 /
 * 重複 / qrSessionValid=false など DB と内部状態だけで reject できるなら、
 * healthCheck 自体を呼ばずに即 reject すべき (外部システム実アクセス禁止)。
 */
export function evaluateAttendanceAutoGuardPreNetwork(
  input: AttendanceAutoGuardPreNetworkInput
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

  if (!input.qrSessionValid) {
    return { allowed: false, reason: 'QR-derived attendance session is not verified' };
  }

  if (input.alreadySubmitted) {
    return { allowed: false, reason: 'attendance was already submitted for this class date' };
  }

  return { allowed: true };
}

/**
 * 全条件を評価する。pre-network が通過した後に campusReachable を含めて判定。
 *
 * 呼び出し側は必ず pre-network 評価 → reject なら return → healthCheck →
 * 本関数、の順序を守ること。本関数を直接呼ぶと healthCheck が外部アクセスを
 * 起こした後でしか呼べなくなる。
 */
export function evaluateAttendanceAutoGuard(
  input: AttendanceAutoGuardInput
): AttendanceAutoGuardResult {
  const pre = evaluateAttendanceAutoGuardPreNetwork(input);
  if (!pre.allowed) return pre;

  if (!input.campusReachable) {
    return { allowed: false, reason: 'attendance system is not reachable from campus network' };
  }

  return { allowed: true };
}
