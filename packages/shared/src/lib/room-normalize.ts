/**
 * 教室名 (room) の正規化と一致判定 (純粋関数)
 *
 * WHY: 時間割側の room と スキャン/QR 側の room は表記が揺れる。
 *   - 時間割 (timetable-parser.ts): UNIPA の HTML から抽出した日本語表示文字列。
 *     実例 (timetable-parser.test.ts): "７３１講義室" (全角数字 + 種別 suffix),
 *     "オンライン"。建物/階/部屋番号がそのまま全角で入る。
 *   - QR / confirm 入力 (attendance-qr.ts / attendance-confirm-input.ts): roomIdSchema は
 *     `[A-Za-z0-9_-]` の 1〜32 文字しか許さない。実例コメント: '8109', 'A-101', '5_3'。
 *
 * confirm/auto guard は現状この 2 つを **厳密等価 (===)** で比較している
 *   (attendance-confirm-guard.ts:108, attendance-auto-guard.ts:96,
 *    attendance-job.ts:434 の session.roomId === timetable.room)。
 * 表記が揺れると全角/半角や suffix の差だけで room_mismatch になり、逆に
 * 緩めすぎると別教室を誤一致させ「他人の/別教室の出席を送る」事故になる。
 *
 * 本モジュールは「確信のある正規化のみ厳密に行い、未知のフォーマット差異には
 * 保守的 (不一致側に倒す)」方針の純粋関数を提供する。副作用なし・I/O なし・
 * env 非依存。Prisma/Next 非依存 (shared の他 util と同じ規約)。
 *
 * 重要: 本モジュールは現時点では **どの guard にも wire しない**。実 QR の
 * roomId フォーマット (数値コードなのか日本語なのか) が未確認のため、まず
 * pure util + test だけをマージし、実サンプル確認後に roomsMatch を guard へ
 * 差し込む。詳細は本タスクの integrationProposal を参照。
 */

/**
 * 全角英数字を半角へ変換する。
 *
 * 対象: 全角数字 (０-９ U+FF10..FF19)、全角英字 (Ａ-Ｚ ａ-ｚ U+FF21..FF3A / FF41..FF5A)。
 * 全角ハイフン/マイナス類 (U+FF0D 全角ハイフンマイナス, U+2212 マイナス記号,
 * U+30FC 長音符は対象外: 長音符は room 種別の一部になりうるため触らない) のうち
 * 「ハイフンとして使われる」記号のみ半角 '-' に寄せる。
 */
function toHalfWidthAlphanumeric(input: string): string {
  let out = '';
  for (const ch of input) {
    const code = ch.codePointAt(0)!;
    // 全角数字・英字 (U+FF01..FF5E は ASCII 0x21..0x7E に -0xFEE0 で対応)
    if (code >= 0xff01 && code <= 0xff5e) {
      out += String.fromCodePoint(code - 0xfee0);
      continue;
    }
    // 全角スペース → 半角スペース (後で trim/除去される)
    if (code === 0x3000) {
      out += ' ';
      continue;
    }
    // 全角ハイフンマイナス / マイナス記号 → 半角ハイフン
    if (code === 0xff0d || code === 0x2212) {
      out += '-';
      continue;
    }
    out += ch;
  }
  return out;
}

/**
 * 既知の「教室種別」suffix。正規化では除去して「建物/部屋番号」コア部分を取り出す。
 *
 * WHY: 時間割側に付く種別語 ("講義室"/"演習室"/"実験室" 等) は、QR 側の
 * roomId コードには通常含まれない。コア (建物 + 部屋番号) を比較対象にするため
 * 末尾の種別語を剥がす。長いものから順にマッチさせる (部分一致の取りこぼし防止)。
 */
const ROOM_TYPE_SUFFIXES = [
  '講義室',
  '演習室',
  '実験室',
  '実習室',
  '会議室',
  '研究室',
  '製図室',
  '体育館',
  '教室',
  '室',
] as const;

/**
 * 末尾の教室種別 suffix を 1 つだけ剥がす。
 *
 * WHY: "７３１講義室" → "731"。"室" 単体も剥がすが、"731" のような数字のみは
 * 影響を受けない。複数 suffix の連結は想定しないため 1 回だけ剥がす (保守的)。
 */
function stripRoomTypeSuffix(input: string): string {
  for (const suffix of ROOM_TYPE_SUFFIXES) {
    if (input.length > suffix.length && input.endsWith(suffix)) {
      return input.slice(0, input.length - suffix.length);
    }
  }
  return input;
}

/**
 * 正規化結果。
 *   - canonical: 比較に使う正規化済み文字列 (半角化 + suffix 除去 + 空白除去 + 大文字化)。
 *   - core:      建物/部屋番号として抽出できた英数字コア (例 "731", "A101")。
 *                抽出できない場合 (例 "オンライン") は null。
 *   - isEmpty:   入力が実質空 (null/undefined/空白のみ) のとき true。
 */
export interface NormalizedRoom {
  canonical: string;
  core: string | null;
  isEmpty: boolean;
}

/**
 * 教室名を正規化する。
 *
 * 手順:
 *   1. null/undefined/空 → isEmpty
 *   2. 全角英数字・全角スペース・全角ハイフンを半角化
 *   3. 内部空白を全除去 + 前後 trim (room 表記に意味のある空白は無いと仮定)
 *   4. 末尾の教室種別 suffix を剥がす
 *   5. 英字は大文字へ寄せる (A-101 と a-101 を同一視)
 *   6. canonical から「英数字 + ハイフン/アンダースコア」のみのコア (建物+部屋番号) を抽出
 *
 * 保守的方針: 日本語のキャンパス名・"オンライン" 等、英数字コアが取れないものは
 * core=null のまま canonical を保持する (roomsMatch 側で扱いを分ける)。
 */
export function normalizeRoom(raw: string | null | undefined): NormalizedRoom {
  if (raw == null) {
    return { canonical: '', core: null, isEmpty: true };
  }

  const halfWidth = toHalfWidthAlphanumeric(raw);
  // 内部空白も含めて全空白を除去する。room 表記に空白の意味は無いと仮定。
  const noSpace = halfWidth.replace(/\s+/g, '');
  if (noSpace.length === 0) {
    return { canonical: '', core: null, isEmpty: true };
  }

  const withoutSuffix = stripRoomTypeSuffix(noSpace);
  const upper = withoutSuffix.toUpperCase();
  const canonical = upper.length > 0 ? upper : noSpace.toUpperCase();

  // コア抽出: canonical 全体が英数字+ハイフン/アンダースコアのみのとき建物/部屋番号コアとみなす。
  // WHY: "731" / "A101" / "A-101" / "5_3" を拾い、"オンライン"/"7号館131" 等は null。
  // WHY(修正): 部分前方一致を禁止する。canonical 全体が ASCII [A-Z0-9_-] の
  // ときのみコアとして採用し、漢字混在 ('7号館131' 等) は core=null に倒す。
  // 旧実装 (/^[A-Z0-9][A-Z0-9_-]*/ の前方一致) は '7号館131' を '7' に切り詰め、
  // 別教室 ('7号館231'->'7') を誤一致させていた (出席誤送信リスク)。
  const core = /^[A-Z0-9_-]+$/.test(canonical) ? canonical : null;

  return { canonical, core, isEmpty: false };
}

/**
 * 2 つの教室名が同一教室を指すかを判定する。
 *
 * 一致条件 (保守的: 確信のある部分のみ true):
 *   1. どちらかが空 (isEmpty) → false。空 room は一致とみなさない。
 *   2. 両方に英数字コア (core) があり、core が完全一致 → true。
 *      (全角/半角・suffix あり/なし・大文字小文字・空白の差を吸収した上での一致)
 *   3. コアが取れない (日本語のみ等) 場合は canonical の完全一致のみ true。
 *      "オンライン" === "オンライン" は true、別表記は false。
 *   4. 片方だけ core がある / core が異なる → false。
 *
 * WHY (保守的設計): 未知の QR フォーマット差異 (例: QR が "8109" で timetable が
 * "８号館109" のような桁構成) を勝手に部分一致させると別教室を誤一致させる恐れが
 * ある。本実装は「正規化後の完全一致」までしか許さず、prefix/部分一致は採らない。
 * 実 QR サンプル確認後、必要なら別関数で緩和ルールを追加する方針。
 */
export function roomsMatch(
  a: string | null | undefined,
  b: string | null | undefined
): boolean {
  const na = normalizeRoom(a);
  const nb = normalizeRoom(b);

  if (na.isEmpty || nb.isEmpty) return false;

  // 両方にコアがあるなら、コア完全一致で判定 (表記揺れ吸収後の厳密比較)
  if (na.core !== null && nb.core !== null) {
    return na.core === nb.core;
  }

  // 片方しかコアが無いケースは「異なる種類の room 表記」とみなし不一致。
  if (na.core !== null || nb.core !== null) {
    return false;
  }

  // 両方コア無し (日本語のみ等) → canonical 完全一致のみ許容
  return na.canonical === nb.canonical;
}
