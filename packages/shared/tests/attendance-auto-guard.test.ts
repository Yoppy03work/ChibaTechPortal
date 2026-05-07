/**
 * 出席 auto 実行ガードの単体テスト
 *
 * WHY: Scheduler 以外の経路から BullMQ にジョブが入っても、Worker 入口で
 * adapter.attend() まで到達しないことを純粋関数で固定する。
 */
import { describe, expect, it } from 'vitest';
import {
  type AttendanceAutoGuardInput,
  type AttendanceAutoGuardPreNetworkInput,
  evaluateAttendanceAutoGuard,
  evaluateAttendanceAutoGuardPreNetwork,
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

  it('授業開始5分前のターゲットから ±2 分を超える時刻は拒否する', () => {
    // WHY: 1 限 9:30 開始 - 5 分 = 9:25 がターゲット。±2 分の許容幅外 (9:22 や 9:28) は reject
    const tooEarly = evaluateAttendanceAutoGuard({
      ...validInput(),
      now: new Date(2026, 4, 4, 9, 22, 0),
    });
    expect(tooEarly.allowed).toBe(false);

    const tooLate = evaluateAttendanceAutoGuard({
      ...validInput(),
      now: new Date(2026, 4, 4, 9, 28, 0),
    });
    expect(tooLate.allowed).toBe(false);
  });

  // WHY: Scheduler / BullMQ のラグで ±1〜2 分ズレても reject せず、安定して
  // ジョブを処理できるようにする許容幅。ターゲット (9:25) ±2 分 = 9:23〜9:27
  it.each([
    ['ターゲット完全一致', 9, 25],
    ['ターゲット -1 分', 9, 24],
    ['ターゲット +1 分', 9, 26],
    ['ターゲット -2 分 (境界)', 9, 23],
    ['ターゲット +2 分 (境界)', 9, 27],
  ])('授業開始 5 分前 ±2 分の範囲 (%s = %d:%d) は許可する', (_label, hour, minute) => {
    const result = evaluateAttendanceAutoGuard({
      ...validInput(),
      now: new Date(2026, 4, 4, hour, minute, 0),
    });
    expect(result).toEqual({ allowed: true });
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

/**
 * pre-network ガードは campusReachable を要求せずに判定できる条件のみを
 * 評価する。Worker 側が adapter.healthCheck() を呼ぶ前にこのガードで
 * reject すれば外部システムへの実アクセスを完全に避けられる。
 */
function validPreNetworkInput(): AttendanceAutoGuardPreNetworkInput {
  return {
    autoExecutionEnabled: true,
    method: 'auto',
    storedMode: 'auto',
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

describe('evaluateAttendanceAutoGuardPreNetwork', () => {
  it('外部アクセス前に判定可能な条件が全て揃えば許可する', () => {
    expect(evaluateAttendanceAutoGuardPreNetwork(validPreNetworkInput())).toEqual({
      allowed: true,
    });
  });

  it('env キルスイッチが false なら healthCheck 前に拒否する', () => {
    const result = evaluateAttendanceAutoGuardPreNetwork({
      ...validPreNetworkInput(),
      autoExecutionEnabled: false,
    });
    expect(result.allowed).toBe(false);
  });

  it('qrSessionValid=false なら healthCheck 前に拒否する', () => {
    const result = evaluateAttendanceAutoGuardPreNetwork({
      ...validPreNetworkInput(),
      qrSessionValid: false,
    });
    expect(result.allowed).toBe(false);
  });

  it.each([
    ['method !== auto', { method: 'confirm' as const }],
    ['storedMode !== auto', { storedMode: 'manual' as const }],
    ['ユーザー不一致', { jobUserId: 'attacker' }],
    ['教室不一致', { jobRoomId: '0000' }],
    ['対象時刻外', { now: new Date(2026, 4, 4, 8, 0, 0) }],
    ['すでに送信済み', { alreadySubmitted: true }],
  ])('条件不足 (%s) なら healthCheck 前に拒否する', (_label, override) => {
    const result = evaluateAttendanceAutoGuardPreNetwork({
      ...validPreNetworkInput(),
      ...override,
    });
    expect(result.allowed).toBe(false);
  });
});

describe('evaluateAttendanceAutoGuard と pre-network の整合', () => {
  it('pre-network が拒否する入力は完全 guard も同じ理由で拒否する', () => {
    // WHY: 完全 guard は内部で pre-network を呼ぶので、reject 理由が
    // 食い違わないことを保証する
    const input: AttendanceAutoGuardInput = {
      ...validPreNetworkInput(),
      campusReachable: true,
      qrSessionValid: false,
    };
    const pre = evaluateAttendanceAutoGuardPreNetwork(input);
    const full = evaluateAttendanceAutoGuard(input);
    expect(pre.allowed).toBe(false);
    expect(full.allowed).toBe(false);
    if (!pre.allowed && !full.allowed) {
      expect(full.reason).toBe(pre.reason);
    }
  });
});
