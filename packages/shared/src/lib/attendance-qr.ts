/**
 * 出席システム QR URL のパース
 *
 * WHY: confirm モードで読み取った QR の中身は untrusted 入力。Zod で
 * 厳密に検証し、roomId 形式以外を一切受け付けない。QR 文字列をログに
 * 出力しない / 例外メッセージにも含めないルール (AGENTS.md QR 採用条件)。
 *
 * 出席システム v3.0 の QR は典型的に以下の形:
 *   https://attendance.example.cit.ac.jp/attendance/class_room/{roomId}
 *
 * roomId は教室コード (英数字 + 一部記号)。ホスト名は CIT のものに限定する。
 * パスは class_room スキーマのみ許可。
 */
import { z } from 'zod';

/**
 * 許可するホスト名のサフィックス。
 *
 * WHY: 攻撃者が QR を偽装しても、CIT 以外のホストにアクセスする URL は
 * 受理しない。サブドメインを許容するため endsWith 判定にする。
 * 環境変数で本番ホストを上書きできる (テスト用に `localhost` 等を許可する用途)。
 */
// WHY: CIT は it-chiba.ac.jp → chibatech.ac.jp にドメイン改称。現行の出席システムは
// attendance.is.chibatech.ac.jp(旧 it-chiba と同一サーバ)なので chibatech.ac.jp が必須。
// 旧 it-chiba.ac.jp も当面有効なため後方互換で残す。
const DEFAULT_ALLOWED_QR_HOST_SUFFIXES = [
  '.cit.ac.jp',
  '.chibatech.ac.jp',
  '.it-chiba.ac.jp',
];

function getAllowedHostSuffixes(): string[] {
  if (typeof process === 'undefined') return DEFAULT_ALLOWED_QR_HOST_SUFFIXES;
  const fromEnv = process.env.ATTENDANCE_QR_ALLOWED_HOST_SUFFIXES;
  if (!fromEnv) return DEFAULT_ALLOWED_QR_HOST_SUFFIXES;
  return fromEnv.split(',').map((s) => s.trim()).filter(Boolean);
}

/**
 * roomId は数字 / 英字 / ハイフン / アンダースコアの 1〜32 文字。
 * 想定: '8109', 'A-101', '5_3' などに対応。
 */
const roomIdSchema = z
  .string()
  .min(1, 'roomId is empty')
  .max(32, 'roomId is too long')
  .regex(/^[A-Za-z0-9_-]+$/, 'roomId contains invalid characters');

/**
 * パース結果。読み取り失敗の理由は型で表現し、UI 側で reason を分岐できるようにする。
 *
 * WHY: error.reason は **コード ID** で、QR 内容や URL 文字列は含めない。
 * ログ出力やエラーメッセージにそのまま流しても情報漏洩しない設計。
 */
export type AttendanceQrParseResult =
  | { ok: true; roomId: string }
  | {
      ok: false;
      reason:
        | 'invalid_url'
        | 'unsupported_protocol'
        | 'host_not_allowed'
        | 'unsupported_path'
        | 'invalid_room_id';
    };

/**
 * QR の読み取り文字列を { roomId } に変換する。
 *
 * 受け入れ条件:
 *   - https URL であること (http は不可)
 *   - ホスト名が ALLOWED_QR_HOST_SUFFIXES のいずれかで終わる
 *   - パスが /attendance/class_room/{roomId} 形式
 *   - roomId が roomIdSchema を満たす
 *
 * 受け入れ外: ok=false + 簡潔な reason コード。raw 文字列は返さない。
 */
export function parseAttendanceQrUrl(raw: string): AttendanceQrParseResult {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: 'invalid_url' };
  }

  // WHY: http (TLS なし) は許可しない。校内 Wi-Fi でも MITM 経由で改竄される可能性
  if (url.protocol !== 'https:') {
    return { ok: false, reason: 'unsupported_protocol' };
  }

  const allowedSuffixes = getAllowedHostSuffixes();
  const host = url.hostname.toLowerCase();
  if (!allowedSuffixes.some((suffix) => host.endsWith(suffix.toLowerCase()))) {
    return { ok: false, reason: 'host_not_allowed' };
  }

  // WHY: パスは /attendance/class_room/{roomId} の 3 segment のみ許可
  const segments = url.pathname.split('/').filter(Boolean);
  if (segments.length !== 3 || segments[0] !== 'attendance' || segments[1] !== 'class_room') {
    return { ok: false, reason: 'unsupported_path' };
  }

  const parsed = roomIdSchema.safeParse(segments[2]);
  if (!parsed.success) {
    return { ok: false, reason: 'invalid_room_id' };
  }

  return { ok: true, roomId: parsed.data };
}
