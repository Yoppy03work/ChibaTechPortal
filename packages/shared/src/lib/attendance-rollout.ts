/**
 * auto 出席の解禁（fail-closed・開発者コード方式）
 *
 * auto 実送信は最高リスク（時間に教室にいなくても QR さえ読めば送れてしまい、代返と
 * 見なされ得る）。そこで auto は「開発者コード」を知っている人だけが解禁できる仕組みにする。
 * 姉妹アプリ モチカタと同じ方式に統一（2026-11-03、旧 env マスタースイッチ + allowlist を置換）。
 *
 *   - 秘密コードは env `ATTENDANCE_AUTO_DEV_CODE` に置く（サーバーのみ）。
 *     未設定なら auto は **永久に解禁不可**（verifyAutoDevCode が常に false）。
 *   - 設定画面でそのコードを入力して一致したときだけ、そのユーザーの保存設定に
 *     autoUnlocked=true が立ち、auto 実行が有効になる（実行の最終判定は auto-guard）。
 *     マルチユーザーでも秘密は 1 つ、解禁はユーザー毎（各自が入力して自分の auto を解禁）。
 *   - dry-run は従来どおり env `ATTENDANCE_AUTO_DRY_RUN` で、安全側（送らない）に倒す。
 *
 * WHY shared: 入力コードの検証（verify）は web（設定 API）が、dry-run 判定は worker が
 * 使う。両方から import できるよう shared に置く（node:crypto はどちらの runtime でも可）。
 */
import { createHash, timingSafeEqual } from 'node:crypto';

/** 開発者コードが env に設定されているか。未設定なら auto は解禁できない。 */
export function isAutoDevCodeConfigured(): boolean {
  return (process.env.ATTENDANCE_AUTO_DEV_CODE ?? '').trim().length > 0;
}

/**
 * 入力コードが env の開発者コードと一致するか（定数時間比較）。
 * env 未設定時は常に false（fail-closed）。
 */
export function verifyAutoDevCode(input: string): boolean {
  const code = (process.env.ATTENDANCE_AUTO_DEV_CODE ?? '').trim();
  if (!code) return false;
  const a = createHash('sha256').update(input).digest();
  const b = createHash('sha256').update(code).digest();
  return timingSafeEqual(a, b);
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
