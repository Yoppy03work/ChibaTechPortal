/**
 * 出席 auto 実行ガードの単体テスト
 *
 * WHY: Scheduler 以外の経路から BullMQ にジョブが入っても、Worker 入口で
 * adapter.attend() まで到達しないことを純粋関数で固定する。
 */
import { describe, expect, it } from 'vitest';
import {
  type AttendanceAutoGuardInput,
  evaluateAttendanceAutoGuard,
} from '../src/lib/attendance-auto-guard';

function validInput(): AttendanceAutoGuardInput {
  return {
    autoExecutionEnabled: true,
    method: 'auto',
    storedMode: 'auto',
    campusReachable: true,
    timetableUserId: 'user-1',
    jobUserId: 'user-1',
    timetableRoom: '8109',
    jobRoomId: '8109',
    dayOfWeek: 1,
    period: 1,
    now: new Date(2026, 4, 4, 9, 25, 0),
    alreadySubmitted: false,
    qrSessionValid: true,
  };
}

describe('evaluateAttendanceAutoGuard', () => {
  it('全条件を満たす場合のみ許可する', () => {
    expect(evaluateAttendanceAutoGuard(validInput())).toEqual({ allowed: true });
  });

  it('server policy のキルスイッチが false なら拒否する', () => {
    const result = evaluateAttendanceAutoGuard({
      ...validInput(),
      autoExecutionEnabled: false,
    });
    expect(result.allowed).toBe(false);
  });

  it('ユーザーが auto を明示ONにしていなければ拒否する', () => {
    const result = evaluateAttendanceAutoGuard({
      ...validInput(),
      storedMode: 'confirm',
    });
    expect(result.allowed).toBe(false);
  });

  it('ジョブのユーザーと時間割所有者が一致しなければ拒否する', () => {
    const result = evaluateAttendanceAutoGuard({
      ...validInput(),
      timetableUserId: 'other-user',
    });
    expect(result.allowed).toBe(false);
  });

  it('教室が時間割と一致しなければ拒否する', () => {
    const result = evaluateAttendanceAutoGuard({
      ...validInput(),
      jobRoomId: '9999',
    });
    expect(result.allowed).toBe(false);
  });

  it('授業開始5分前の対象曜日/時限でなければ拒否する', () => {
    const result = evaluateAttendanceAutoGuard({
      ...validInput(),
      now: new Date(2026, 4, 4, 9, 24, 0),
    });
    expect(result.allowed).toBe(false);
  });

  it('CIT Wi-Fi 到達性がなければ拒否する', () => {
    const result = evaluateAttendanceAutoGuard({
      ...validInput(),
      campusReachable: false,
    });
    expect(result.allowed).toBe(false);
  });

  it('QR由来セッションが検証済みでなければ拒否する', () => {
    const result = evaluateAttendanceAutoGuard({
      ...validInput(),
      qrSessionValid: false,
    });
    expect(result.allowed).toBe(false);
  });

  it('同一授業が送信済みなら拒否する', () => {
    const result = evaluateAttendanceAutoGuard({
      ...validInput(),
      alreadySubmitted: true,
    });
    expect(result.allowed).toBe(false);
  });
});
