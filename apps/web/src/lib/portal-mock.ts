/**
 * ポータル各画面のモックデータ。
 *
 * WHY: 段階実装フェーズ1は「見た目優先・モック据え置き」。設計 (ChibaTech Portal
 * App.dc.html) の renderVals をそのまま移植し、色は CSS 変数トークンで表現するので
 * テーマ非依存。後段で実データ（時間割/出席/お知らせ API）へ差し替える。
 */

/* ── 今日の時間割（ホーム） ───────────────────────────── */
export type TodayClass = {
  start: string;
  end: string;
  name: string;
  meta: string;
  dot: string;
  live: boolean;
  stLabel: string;
  stBg: string;
  stFg: string;
  stBorder: string;
};

export const todayClasses: TodayClass[] = [
  { start: '09:00', end: '10:30', name: '確率統計', meta: '12号館 1206 · 三浦 教授', dot: 'var(--ink-2)', live: true, stLabel: '進行中', stBg: 'var(--ink)', stFg: 'var(--surface)', stBorder: 'var(--ink)' },
  { start: '10:40', end: '12:10', name: '情報理論', meta: '2号館 2401 · 佐藤 准教授', dot: 'var(--ink)', live: false, stLabel: '次', stBg: 'transparent', stFg: 'var(--ink)', stBorder: 'var(--ink-2)' },
  { start: '13:00', end: '14:30', name: 'プログラミング演習Ⅱ', meta: '9号館 PC室3 · 鈴木 講師', dot: 'var(--ink-3)', live: false, stLabel: '予定', stBg: 'var(--surface-2)', stFg: 'var(--ink-3)', stBorder: 'transparent' },
  { start: '14:40', end: '16:10', name: '英語コミュニケーションⅡB', meta: '5号館 5102 · J. Smith', dot: 'var(--ink-3)', live: false, stLabel: '予定', stBg: 'var(--surface-2)', stFg: 'var(--ink-3)', stBorder: 'transparent' },
];

/* ── お知らせ（複数ソースを集約：CIT Portal / manaba / メール など） ── */
type Tag = '重要' | '学務' | '授業' | '就職';
const TAG: Record<Tag, { bg: string; fg: string; bd: string }> = {
  重要: { bg: 'var(--ink)', fg: 'var(--surface)', bd: 'var(--ink)' },
  学務: { bg: 'transparent', fg: 'var(--ink-2)', bd: 'var(--line-2)' },
  授業: { bg: 'transparent', fg: 'var(--ink-2)', bd: 'var(--line-2)' },
  就職: { bg: 'transparent', fg: 'var(--ink-2)', bd: 'var(--line-2)' },
};

// 収集元（チャンネル）。将来は worker が各ソースから集約する。
export type Channel = 'cit' | 'manaba' | 'mail';
export const CHANNEL_LABEL: Record<Channel, string> = { cit: 'CIT Portal', manaba: 'manaba', mail: 'メール' };

type RawNews = {
  key: Tag;
  channel: Channel;
  tag: string;
  pinned?: boolean;
  unread?: boolean;
  title: string;
  snippet: string;
  source: string;
  time: string;
};

const rawNews: RawNews[] = [
  { key: '重要', channel: 'cit', tag: '重要', pinned: true, unread: true, title: '前期末試験の時間割を公開しました', snippet: '試験は7月22日(月)〜26日(金)に実施します。受験要領を必ず確認してください。', source: '学務課', time: '1時間前' },
  { key: '学務', channel: 'mail', unread: true, tag: '学務', title: '【大学メール】履修登録エラーのお知らせ', snippet: '一部科目で定員超過が発生しています。至急ご確認ください。', source: '教務課メール', time: '30分前' },
  { key: '授業', channel: 'manaba', tag: '授業', unread: true, title: '情報理論：第9回 講義資料をアップロードしました', snippet: '第9回「通信路符号化」のスライドPDFを公開しました。', source: '佐藤 健 准教授', time: '3時間前' },
  { key: '授業', channel: 'manaba', tag: '授業', title: 'データ構造：小テストの成績を公開しました', snippet: '第4回小テストの採点が完了しました。', source: '山田 浩 教授', time: '4時間前' },
  { key: '学務', channel: 'cit', tag: '学務', title: '学生証の更新手続きについて', snippet: '有効期限が近い学生は学生課窓口で更新してください。', source: '学務課', time: '昨日 12:30' },
  { key: '就職', channel: 'mail', tag: '就職', title: '2027卒向け 学内企業説明会の申込開始', snippet: '6月10日開催。先着順、本ポータルから申込できます。', source: 'キャリアセンター', time: '昨日 10:00' },
  { key: '授業', channel: 'manaba', tag: '授業', title: '英語ⅡB：次回の教室が変更になりました', snippet: '5号館 5102 → 5210 に変更。お間違えのないように。', source: 'J. Smith', time: '2日前' },
  { key: '学務', channel: 'mail', tag: '学務', title: '図書館 開館時間の変更（試験期間）', snippet: '試験期間中は22時まで開館時間を延長します。', source: '附属図書館', time: '3日前' },
];

export type NewsItem = RawNews & {
  tagBg: string;
  tagFg: string;
  tagBorder: string;
  channelLabel: string;
  foot: string;
  cardBorder: string;
};

export const newsItems: NewsItem[] = rawNews.map((n) => {
  const c = TAG[n.key];
  const channelLabel = CHANNEL_LABEL[n.channel];
  return {
    ...n,
    tagBg: c.bg,
    tagFg: c.fg,
    tagBorder: c.bd,
    channelLabel,
    foot: `${channelLabel} · ${n.time}`,
    cardBorder: n.pinned ? 'var(--ink)' : 'var(--line)',
  };
});

export const newsTop = newsItems.slice(0, 4);

// お知らせのソース別件数（フィルタチップ用）
export const channelCounts: Record<Channel | 'all', number> = {
  all: newsItems.length,
  cit: newsItems.filter((n) => n.channel === 'cit').length,
  manaba: newsItems.filter((n) => n.channel === 'manaba').length,
  mail: newsItems.filter((n) => n.channel === 'mail').length,
};

/* ── 出席 ─────────────────────────────────────────────── */
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

function attendanceStyle(pct: number): AttendanceStyle {
  if (pct < 67)
    return { cardBg: 'var(--ink)', cardBorder: 'var(--ink)', nameColor: 'var(--surface)', subColor: 'var(--ink-3)', barTrack: 'rgba(127,127,127,.40)', barColor: 'var(--surface)', pctColor: 'var(--surface)', stLabel: '危険', stBg: 'var(--surface)', stFg: 'var(--ink)', stBorder: 'var(--surface)', dotColor: 'var(--surface)' };
  if (pct < 80)
    return { cardBg: 'var(--surface)', cardBorder: 'var(--line)', nameColor: 'var(--ink)', subColor: 'var(--ink-3)', barTrack: 'var(--surface-2)', barColor: 'var(--ink-2)', pctColor: 'var(--ink)', stLabel: '注意', stBg: 'transparent', stFg: 'var(--ink)', stBorder: 'var(--ink-2)', dotColor: 'var(--ink)' };
  return { cardBg: 'var(--surface)', cardBorder: 'var(--line)', nameColor: 'var(--ink)', subColor: 'var(--ink-3)', barTrack: 'var(--surface-2)', barColor: 'var(--ink-3)', pctColor: 'var(--ink)', stLabel: '良好', stBg: 'transparent', stFg: 'var(--ink-3)', stBorder: 'var(--line-2)', dotColor: 'var(--ink-3)' };
}

export type AttendanceCourse = AttendanceStyle & {
  name: string;
  attended: number;
  total: number;
  pct: number;
  pctText: string;
  absent: number;
};

export const attendanceCourses: AttendanceCourse[] = [
  { name: '微分積分Ⅱ', attended: 8, total: 8 },
  { name: '物理学Ⅱ', attended: 7, total: 8 },
  { name: 'データ構造', attended: 8, total: 9 },
  { name: '線形代数Ⅱ', attended: 9, total: 9 },
  { name: '電気回路', attended: 6, total: 8 },
  { name: '情報理論', attended: 8, total: 8 },
  { name: 'プログラミング演習Ⅱ', attended: 7, total: 8 },
  { name: '英語コミュニケーションⅡB', attended: 5, total: 9 },
  { name: 'アルゴリズム論', attended: 8, total: 8 },
  { name: 'キャリアデザイン', attended: 7, total: 8 },
].map((c) => {
  const pct = Math.round((c.attended / c.total) * 100);
  return { ...c, pct, pctText: `${pct}%`, absent: c.total - c.attended, ...attendanceStyle(pct) };
});

export const riskCourses = attendanceCourses.filter((c) => c.pct < 80);

/* ── 時間割グリッド ───────────────────────────────────── */
export type Cat = 'senmon' | 'suuri' | 'enshu' | 'gogaku' | 'jikken' | 'kyoyo';
export type ClassCell = { name: string; room: string; cat: Cat } | null;

export function tierBar(cat: Cat): string {
  return cat === 'senmon' ? 'var(--ink)' : cat === 'suuri' ? 'var(--ink-2)' : 'var(--ink-3)';
}

const m = (name: string, room: string, cat: Cat): ClassCell => ({ name, room, cat });

// timetableGrid[day][period]（設計と同じ向き）。6日(月〜土) × 5時限。
// todayCol=3(木)、木2限(情報理論)が現在の授業。
export const timetableGrid: ClassCell[][] = [
  [m('微分積分Ⅱ', '1201', 'suuri'), m('物理学Ⅱ', '3201', 'senmon'), null, m('体育実技', '体育館', 'kyoyo'), null],
  [null, m('データ構造', '2305', 'senmon'), m('データ構造演習', 'PC2', 'enshu'), null, null],
  [m('線形代数Ⅱ', '1203', 'suuri'), null, m('電気回路', '4102', 'senmon'), m('電気回路実験', '実験棟', 'jikken'), m('電気回路実験', '実験棟', 'jikken')],
  [m('確率統計', '1206', 'suuri'), m('情報理論', '2401', 'senmon'), m('プログラミング演習Ⅱ', 'PC3', 'enshu'), m('英語ⅡB', '5102', 'gogaku'), null],
  [null, m('アルゴリズム論', '2208', 'senmon'), null, m('キャリアデザイン', '3105', 'kyoyo'), null],
  [m('技術者倫理', '1101', 'kyoyo'), null, null, null, null],
];

export const periods = [
  { p: '1', t: '9:00' },
  { p: '2', t: '10:40' },
  { p: '3', t: '13:00' },
  { p: '4', t: '14:40' },
  { p: '5', t: '16:20' },
];

export const ttDayLabels = ['月', '火', '水', '木', '金', '土'];
export const todayCol = 3; // 木
export const nowPeriodIndex = 1; // 2限が現在

/* ── 課題・提出物 ─────────────────────────────────────── */
export type AssignStatus = 'overdue' | 'urgent' | 'pending' | 'submitted' | 'graded';

type AssignStyle = {
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

function assignStyle(st: AssignStatus): AssignStyle {
  if (st === 'overdue') return { cardBg: 'var(--ink)', cardBorder: 'var(--ink)', titleColor: 'var(--surface)', metaColor: 'var(--surface)', subColor: 'var(--ink-3)', badgeLabel: '期限切れ', badgeBg: 'var(--surface)', badgeFg: 'var(--ink)', badgeBorder: 'var(--surface)', actBg: 'var(--surface)', actFg: 'var(--ink)' };
  if (st === 'urgent') return { cardBg: 'var(--surface)', cardBorder: 'var(--ink)', titleColor: 'var(--ink)', metaColor: 'var(--ink)', subColor: 'var(--ink-3)', badgeLabel: '未提出', badgeBg: 'var(--ink)', badgeFg: 'var(--surface)', badgeBorder: 'var(--ink)', actBg: 'var(--ink)', actFg: 'var(--surface)' };
  if (st === 'pending') return { cardBg: 'var(--surface)', cardBorder: 'var(--line)', titleColor: 'var(--ink)', metaColor: 'var(--ink-2)', subColor: 'var(--ink-3)', badgeLabel: '未提出', badgeBg: 'transparent', badgeFg: 'var(--ink-2)', badgeBorder: 'var(--line-2)', actBg: 'var(--ink)', actFg: 'var(--surface)' };
  if (st === 'submitted') return { cardBg: 'var(--surface)', cardBorder: 'var(--line)', titleColor: 'var(--ink)', metaColor: 'var(--ink-3)', subColor: 'var(--ink-3)', badgeLabel: '提出済', badgeBg: 'transparent', badgeFg: 'var(--ink)', badgeBorder: 'var(--ink-2)', actBg: 'transparent', actFg: 'var(--ink)' };
  return { cardBg: 'var(--surface)', cardBorder: 'var(--line)', titleColor: 'var(--ink)', metaColor: 'var(--ink-3)', subColor: 'var(--ink-3)', badgeLabel: '採点済', badgeBg: 'var(--surface-2)', badgeFg: 'var(--ink-2)', badgeBorder: 'transparent', actBg: 'transparent', actFg: 'var(--ink)' };
}

type RawAssign = {
  course: string;
  title: string;
  due: string;
  status: AssignStatus;
  left?: string;
  file?: string;
  score?: string;
};

const assignmentsRaw: RawAssign[] = [
  { course: 'プログラミング演習Ⅱ', title: '演習課題 #5：再帰とスタック', due: '5月15日 (木) 13:00', status: 'urgent', left: 'あと1日' },
  { course: '情報理論', title: 'レポート第3回：情報源符号化', due: '5月16日 (金) 23:59', status: 'urgent', left: 'あと2日' },
  { course: '電気回路実験', title: '実験レポート（第4回）RC回路', due: '5月19日 (月) 17:00', status: 'pending', left: 'あと5日' },
  { course: '英語コミュニケーションⅡB', title: 'Essay Draft #2', due: '5月12日 (月) 締切', status: 'overdue', left: '2日 超過' },
  { course: '確率統計', title: '小テスト 復習課題', due: '5月13日 提出', status: 'submitted', file: 'kakuritsu_w4.pdf' },
  { course: '線形代数学Ⅱ', title: '課題2：線形空間と基底', due: '5月8日 提出', status: 'graded', file: 'linalg_hw2.pdf', score: '18 / 20' },
  { course: '微分積分Ⅱ', title: '章末問題 1–3', due: '5月7日 提出', status: 'graded', file: 'calc_ex1.pdf', score: '20 / 20' },
];

export type Assignment = RawAssign &
  AssignStyle & {
    isOpen: boolean;
    isDone: boolean;
    isGraded: boolean;
    hasLeft: boolean;
    fileText: string;
    scoreText: string;
  };

export const assignments: Assignment[] = assignmentsRaw.map((a) => ({
  ...a,
  ...assignStyle(a.status),
  isOpen: a.status === 'urgent' || a.status === 'pending' || a.status === 'overdue',
  isDone: a.status === 'submitted' || a.status === 'graded',
  isGraded: a.status === 'graded',
  hasLeft: !!a.left,
  fileText: a.file || '',
  scoreText: a.score || '',
}));

export const openCount = assignments.filter((a) => a.isOpen).length;
export const overdueCount = assignments.filter((a) => a.status === 'overdue').length;
