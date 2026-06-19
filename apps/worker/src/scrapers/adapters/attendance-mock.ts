/**
 * 出席システムのモックアダプタ（ローカル / dev 専用）
 *
 * WHY: confirm / auto の全経路（UI → API → queue → worker → adapter）を CIT_Wi-Fi
 * なしでローカル検証するための seam。`healthCheck()` は常に true を返して校外でも
 * `adapter.attend()` まで到達させ、`attend()` は ATTENDANCE_MOCK_RESULT で結果を制御する。
 * 実際の外部 HTTP は一切出さない。生成は adapter-factory が NODE_ENV!=='production' の
 * ときだけ許可する（本番混入は factory 側で throw ガード）。
 */
import type { AttendanceAdapter, AttendanceResult } from '@chibatech/shared';

/** ATTENDANCE_MOCK_RESULT に応じた結果を返す（既定 success）。 */
function mockResult(): AttendanceResult {
  const kind = process.env.ATTENDANCE_MOCK_RESULT ?? 'success';
  if (kind === 'fail') {
    return { success: false, message: 'mock failure', classDate: new Date() };
  }
  if (kind === 'no-class') {
    return {
      success: false,
      message: '現在、出席できる授業はありません',
      classDate: new Date(),
    };
  }
  return { success: true, message: '出席完了(mock)', classDate: new Date() };
}

export class MockAttendanceAdapter implements AttendanceAdapter {
  readonly name = 'mock';

  // WHY: ドライラン / テストで attend が実際に呼ばれたかを検証できるよう記録する。
  readonly attendCalls: Array<{ userId: string; roomId: string }> = [];

  async healthCheck(): Promise<boolean> {
    // WHY: 校外でも全経路を流すため常に到達可能扱いにする。
    return true;
  }

  async attend(
    userId: string,
    _password: string,
    roomId: string
  ): Promise<AttendanceResult> {
    this.attendCalls.push({ userId, roomId });
    const result = mockResult();
    console.log(
      `[attendance-mock] attend called: user=${userId} room=${roomId} → ${
        result.success ? 'success' : 'fail'
      }`
    );
    return result;
  }

  async attendWithSession(
    _cookies: Record<string, string>,
    roomId: string
  ): Promise<AttendanceResult> {
    this.attendCalls.push({ userId: '(session)', roomId });
    return mockResult();
  }
}
