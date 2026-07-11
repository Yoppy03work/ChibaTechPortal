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

/* ── 授業カテゴリ風の濃淡（実データにはカテゴリが無いため名前ハッシュで安定配色） ── */
export function classTier(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return ['var(--ink)', 'var(--ink-2)', 'var(--ink-3)'][h % 3];
}
