/**
 * auto 出席の段階解禁フラグ（fail-closed）
 *
 * WHY: auto 実送信はリポジトリ最高リスク。env で dark default にし、
 *   dry-run → allowlist 単一ユーザー → full
 * の段階で解禁する。解禁の判断は env のみで進められる（コード変更不要）。
 *
 * 安全側の既定:
 * - 何も設定しなければ全て無効（auto は走らない）。
 * - allowlist が空のときは「全員許可」ではなく「誰も許可しない」(fail-closed)。
 *   env クリア事故で全員解禁になるのを防ぐ。全員許可は明示の opt-in が必要。
 */

/** auto 実送信のマスターキルスイッチ。true のときのみ auto 経路が生きる。 */
export function isAutoExecutionEnabled(): boolean {
  return process.env.ATTENDANCE_AUTO_EXECUTION_ENABLED === 'true';
}

/**
 * このユーザーが auto 解禁対象か。
 * - ATTENDANCE_AUTO_ALLOWLIST_ALL=true: 全員許可（明示 opt-in。本番全解禁用）。
 * - それ以外: ATTENDANCE_AUTO_ALLOWLIST のカンマ区切り userId に含まれるユーザーのみ。
 *   空 allowlist は誰も許可しない（fail-closed）。
 */
export function isUserAllowlisted(userId: string): boolean {
  if (process.env.ATTENDANCE_AUTO_ALLOWLIST_ALL === 'true') return true;
  const list = (process.env.ATTENDANCE_AUTO_ALLOWLIST ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return list.includes(userId);
}

/**
 * dry-run か。true のとき全 guard を通すが adapter.attend() は実行せず
 * （no-op + 監査ログ）、外部送信なしで経路全体を検証する。
 *
 * WHY (fail-toward-dry-run): このフラグは「実送信させない」ための安全弁なので、
 * 安全側＝送らない方向に倒す。dry-run 検証中に値を typo (`tru` 等) しても
 * 実送信にならないよう、空でも 'false'/'0'/'no' でもない値は全て dry-run 扱いにする。
 * 実送信したいときは未設定 or 明示的に false/0/no にする (= 明示 opt-out)。
 */
export function isAutoDryRun(): boolean {
  const v = (process.env.ATTENDANCE_AUTO_DRY_RUN ?? '').trim().toLowerCase();
  return v !== '' && v !== 'false' && v !== '0' && v !== 'no';
}
