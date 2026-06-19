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
 */
export function isAutoDryRun(): boolean {
  return process.env.ATTENDANCE_AUTO_DRY_RUN === 'true';
}
