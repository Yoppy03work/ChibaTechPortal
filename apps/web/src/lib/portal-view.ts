/**
 * 画面表示用の共通スタイルマッパー・表示ユーティリティ。
 *
 * WHY: リデザインのモノクロトークン（CSS変数）で状態別の配色を組み立てるロジックを
 * 一箇所に集約する。データ取得（portal-data）とは分離し、server/client 両方から
 * import できる純粋関数のみを置く。
 */

/* ── お知らせのソース（収集チャンネル） ───────────────── */
export type Channel = 'cit' | 'manaba' | 'mail';

export const CHANNEL_LABEL: Record<Channel, string> = {
  cit: 'CIT Portal',
  manaba: 'manaba',
  mail: 'メール',
};

/* ── 出席率の状態別スタイル ───────────────────────────── */
export type AttendanceStyle = {
  cardBg: string;
  cardBorder: string;
  nameColor: string;
  subColor: string;
  barTrack: string;
  barColor: string;
  pctColor: string;
  stLabel: string;
  stBg: string;
  stFg: string;
  stBorder: string;
  dotColor: string;
};

export function attendanceStyle(pct: number): AttendanceStyle {
  if (pct < 67)
    return { cardBg: 'var(--ink)', cardBorder: 'var(--ink)', nameColor: 'var(--surface)', subColor: 'var(--ink-3)', barTrack: 'rgba(127,127,127,.40)', barColor: 'var(--surface)', pctColor: 'var(--surface)', stLabel: '危険', stBg: 'var(--surface)', stFg: 'var(--ink)', stBorder: 'var(--surface)', dotColor: 'var(--surface)' };
  if (pct < 80)
    return { cardBg: 'var(--surface)', cardBorder: 'var(--line)', nameColor: 'var(--ink)', subColor: 'var(--ink-3)', barTrack: 'var(--surface-2)', barColor: 'var(--ink-2)', pctColor: 'var(--ink)', stLabel: '注意', stBg: 'transparent', stFg: 'var(--ink)', stBorder: 'var(--ink-2)', dotColor: 'var(--ink)' };
  return { cardBg: 'var(--surface)', cardBorder: 'var(--line)', nameColor: 'var(--ink)', subColor: 'var(--ink-3)', barTrack: 'var(--surface-2)', barColor: 'var(--ink-3)', pctColor: 'var(--ink)', stLabel: '良好', stBg: 'transparent', stFg: 'var(--ink-3)', stBorder: 'var(--line-2)', dotColor: 'var(--ink-3)' };
}

/* ── 課題の状態別スタイル ─────────────────────────────── */
export type AssignmentStatus = 'overdue' | 'urgent' | 'pending' | 'submitted';

export type AssignStyle = {
  cardBg: string;
  cardBorder: string;
  titleColor: string;
  metaColor: string;
  subColor: string;
  badgeLabel: string;
  badgeBg: string;
  badgeFg: string;
  badgeBorder: string;
  actBg: string;
  actFg: string;
};

export function assignStyle(st: AssignmentStatus): AssignStyle {
  if (st === 'overdue') return { cardBg: 'var(--ink)', cardBorder: 'var(--ink)', titleColor: 'var(--surface)', metaColor: 'var(--surface)', subColor: 'var(--ink-3)', badgeLabel: '期限切れ', badgeBg: 'var(--surface)', badgeFg: 'var(--ink)', badgeBorder: 'var(--surface)', actBg: 'var(--surface)', actFg: 'var(--ink)' };
  if (st === 'urgent') return { cardBg: 'var(--surface)', cardBorder: 'var(--ink)', titleColor: 'var(--ink)', metaColor: 'var(--ink)', subColor: 'var(--ink-3)', badgeLabel: '未提出', badgeBg: 'var(--ink)', badgeFg: 'var(--surface)', badgeBorder: 'var(--ink)', actBg: 'var(--ink)', actFg: 'var(--surface)' };
  if (st === 'pending') return { cardBg: 'var(--surface)', cardBorder: 'var(--line)', titleColor: 'var(--ink)', metaColor: 'var(--ink-2)', subColor: 'var(--ink-3)', badgeLabel: '未提出', badgeBg: 'transparent', badgeFg: 'var(--ink-2)', badgeBorder: 'var(--line-2)', actBg: 'var(--ink)', actFg: 'var(--surface)' };
  return { cardBg: 'var(--surface)', cardBorder: 'var(--line)', titleColor: 'var(--ink)', metaColor: 'var(--ink-3)', subColor: 'var(--ink-3)', badgeLabel: '提出済', badgeBg: 'transparent', badgeFg: 'var(--ink)', badgeBorder: 'var(--ink-2)', actBg: 'transparent', actFg: 'var(--ink)' };
}

/* ── 授業カテゴリ（専門/教養 × 必修/選択）の分類と識別色 ─────────────
 * WHY: Syllabus.category は「専門科目 必修」等の自由テキストのため部分一致で分類する。
 * モノクロトークンの濃淡4段で表現（濃=専門必修 → 淡=教養選択）。未分類（シラバス
 * 未取得等）はバー無し。 */
export type CourseCategoryKey = 'senmon-hisshu' | 'senmon-sentaku' | 'kyoyo-hisshu' | 'kyoyo-sentaku' | 'unknown';

export function classifyCategory(cat: string | null | undefined): CourseCategoryKey {
  if (!cat) return 'unknown';
  const major = /専門/.test(cat) ? 'senmon' : /教養|共通|基礎|人文|社会|語学|外国語|体育|健康/.test(cat) ? 'kyoyo' : null;
  if (!major) return 'unknown';
  // WHY: 「必修」明記のみ必修扱い。それ以外（選択/選択必修/無印）は選択側に倒す
  const req = /必修/.test(cat) && !/選択必修/.test(cat) ? 'hisshu' : 'sentaku';
  return `${major}-${req}` as CourseCategoryKey;
}

export const CATEGORY_BAR: Record<CourseCategoryKey, string> = {
  'senmon-hisshu': 'var(--ink)',
  'senmon-sentaku': 'var(--ink-2)',
  'kyoyo-hisshu': 'var(--ink-3)',
  'kyoyo-sentaku': 'var(--line-2)',
  unknown: 'transparent',
};

export function categoryBar(cat: string | null | undefined): string {
  return CATEGORY_BAR[classifyCategory(cat)];
}

/** 時間割の凡例表示用 */
export const CATEGORY_LEGEND: { key: CourseCategoryKey; label: string }[] = [
  { key: 'senmon-hisshu', label: '専門・必修' },
  { key: 'senmon-sentaku', label: '専門・選択' },
  { key: 'kyoyo-hisshu', label: '教養・必修' },
  { key: 'kyoyo-sentaku', label: '教養・選択' },
];
