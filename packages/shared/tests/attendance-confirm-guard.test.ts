/**
 * confirm 送信ガードのテスト
 *
 * WHY: API 層と Worker 入口の両方で同じ guard を通すので、各条件の reject 理由と
 * チェック順序を固定する。フロント検証バイパス時 (curl 等) のサーバー側拒否を
 * 保証する。
 */
import { describe, expect, it } from 'vitest';
import {
  evaluateConfirmSubmitGuard,
  formatJstYmd,
  type ConfirmSubmitGuardInput,
} from '../src/lib/attendance-confirm-guard';

function validInput(): ConfirmSubmitGuardInput {
  // 1限ターゲット (9:25 = 9:30 - 5) で月曜
  const now = new Date('2026-05-04T09:25:00+09:00'); // 月曜
  return {
    jobUserId: 'user-1',
    jobTimetableId: 'tt-1',
    jobRoomId: '8109',
    jobClassDateYmd: '2026-05-04',
    timetableUserId: 'user-1',
    timetableRoom: '8109',
    timetableDayOfWeek: 1,
    timetablePeriod: 1,
    alreadySubmittedConfirm: false,
    hasCitCreds: true,
    now,
  };
}

describe('evaluateConfirmSubmitGuard', () => {
  it('全条件を満たす場合のみ allowed', () => {
    expect(evaluateConfirmSubmitGuard(validInput())).toEqual({ allowed: true });
  });

  it('timetable 所有者が違えば timetable_not_owned', () => {
    const r = evaluateConfirmSubmitGuard({
      ...validInput(),
      timetableUserId: 'other-user',
    });
    expect(r).toEqual({ allowed: false, reason: 'timetable_not_owned' });
  });

  it('roomId が時間割と不一致なら room_mismatch (PR #15 残リスク対応)', () => {
    // WHY: PR #15 Codex 指摘で「サーバー側で room mismatch を送信不可にする必要」
    // この PR で確実に reject されることをここで固定する
    const r = evaluateConfirmSubmitGuard({
      ...validInput(),
      jobRoomId: '0000',
    });
    expect(r).toEqual({ allowed: false, reason: 'room_mismatch' });
  });

  it('timetable.room が null なら room_mismatch', () => {
    const r = evaluateConfirmSubmitGuard({
      ...validInput(),
      timetableRoom: null,
    });
    expect(r).toEqual({ allowed: false, reason: 'room_mismatch' });
  });

  it('classDate が今日でなければ class_date_mismatch', () => {
    // 昨日を指定
    const r = evaluateConfirmSubmitGuard({
      ...validInput(),
      jobClassDateYmd: '2026-05-03',
    });
    expect(r).toEqual({ allowed: false, reason: 'class_date_mismatch' });
  });

  it('時刻ウィンドウ外 (9:22 = -3 分) なら outside_time_window', () => {
    const r = evaluateConfirmSubmitGuard({
      ...validInput(),
      now: new Date('2026-05-04T09:22:00+09:00'),
      // jobClassDateYmd は同日のままにする
      jobClassDateYmd: '2026-05-04',
    });
    expect(r).toEqual({ allowed: false, reason: 'outside_time_window' });
  });

  it('±2 分許容内 (9:27 = +2 分) なら通過', () => {
    const r = evaluateConfirmSubmitGuard({
      ...validInput(),
      now: new Date('2026-05-04T09:27:00+09:00'),
      jobClassDateYmd: '2026-05-04',
    });
    expect(r).toEqual({ allowed: true });
  });

  it('同日 confirm 重複ありなら already_submitted', () => {
    const r = evaluateConfirmSubmitGuard({
      ...validInput(),
      alreadySubmittedConfirm: true,
    });
    expect(r).toEqual({ allowed: false, reason: 'already_submitted' });
  });

  it('認証情報が無ければ credentials_not_registered', () => {
    const r = evaluateConfirmSubmitGuard({
      ...validInput(),
      hasCitCreds: false,
    });
    expect(r).toEqual({ allowed: false, reason: 'credentials_not_registered' });
  });

  it('class_date 判定は host TZ ではなく JST のカレンダー日で行う (TZ非依存・回帰防止)', () => {
    // WHY: 旧実装は jobClassDate を toClassDate(new Date('YYYY-MM-DD')) で作り、
    // host TZ の setHours で truncate してから JST 比較していた。負 UTC オフセットの
    // ホスト (例: 米国 TZ の開発機) では JST 日とズレ、有効な confirm が全て
    // class_date_mismatch で誤却下される回帰があった。文字列比較に変えて TZ 非依存に
    // した本修正を固定する。
    //
    // now = 2026-05-04T15:30:00Z は JST では 2026-05-05 00:30。UTC 日 (05-04) ではなく
    // JST 日 (05-05) で判定されることを 2 方向から固定する。
    const now = new Date('2026-05-04T15:30:00Z');
    expect(formatJstYmd(now)).toBe('2026-05-05');

    // JST 日 (05-05) を渡すと date チェックは通過し、00:30 JST は授業ウィンドウ外
    // なので後段の outside_time_window で落ちる (= class_date_mismatch では落ちない)。
    const jstDay = evaluateConfirmSubmitGuard({
      ...validInput(),
      now,
      jobClassDateYmd: '2026-05-05',
    });
    expect(jstDay).toEqual({ allowed: false, reason: 'outside_time_window' });

    // UTC 日 (05-04) を渡すと JST 日 (05-05) と食い違い class_date_mismatch。
    const utcDay = evaluateConfirmSubmitGuard({
      ...validInput(),
      now,
      jobClassDateYmd: '2026-05-04',
    });
    expect(utcDay).toEqual({ allowed: false, reason: 'class_date_mismatch' });
  });

  it('複数条件 NG 時はチェック順最初の reason を返す (timetable_not_owned が優先)', () => {
    // WHY: 所有確認 → 教室一致 → ... の順で checkpoint。情報漏洩観点でも、
    // 他人の timetable に対して教室一致確認するより先に所有を弾くべき
    const r = evaluateConfirmSubmitGuard({
      ...validInput(),
      timetableUserId: 'other-user',
      jobRoomId: '0000',
    });
    expect(r).toEqual({ allowed: false, reason: 'timetable_not_owned' });
  });
});
