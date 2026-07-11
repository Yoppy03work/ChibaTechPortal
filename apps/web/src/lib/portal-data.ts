/**
 * ポータル画面のサーバー側データ取得（Prisma）＋表示用整形。
 *
 * WHY: リデザイン画面（ホーム/時間割/お知らせ/課題/出席）をモックから実データに接続する。
 * JST 依存の判定は shared の getJstParts/formatJstYmd に統一（ホストTZ非依存）。
 * classDate は「JST の YYYY-MM-DD を UTC midnight で保存」する既存規約に従う。
 */
import { prisma } from '@chibatech/db';
import { PERIOD_START_TIMES, PERIOD_MINUTES, getJstParts, formatJstYmd } from '@chibatech/shared';
import type { Channel, AssignmentStatus } from './portal-view';
import { CHANNEL_LABEL } from './portal-view';

// WHY: CIT は 1時限=60分 の10限制（9:00〜19:00）
const CLASS_MINUTES = PERIOD_MINUTES;
const WD = ['日', '月', '火', '水', '木', '金', '土'];
const two = (n: number) => String(n).padStart(2, '0');

/* ── 今日の時間割 ─────────────────────────────────────── */
export type ScheduleStatus = 'live' | 'next' | 'upcoming' | 'done';

export interface TodayClassRow {
  timetableId: string;
  period: number;
  start: string;
  end: string;
  startMin: number;
  name: string;
  room: string;
  status: ScheduleStatus;
}

function periodTimes(period: number) {
  const t = PERIOD_START_TIMES[period];
  if (!t) return { start: '—', end: '—', startMin: -1, endMin: -1 };
  const startMin = t.hour * 60 + t.minute;
  const endMin = startMin + CLASS_MINUTES;
  return {
    start: `${two(t.hour)}:${two(t.minute)}`,
    end: `${two(Math.floor(endMin / 60))}:${two(endMin % 60)}`,
    startMin,
    endMin,
  };
}

export async function getTodayClasses(userId: string, now = new Date()): Promise<TodayClassRow[]> {
  const jst = getJstParts(now);
  const rows = await prisma.timetable.findMany({
    where: { userId, dayOfWeek: jst.dayOfWeek },
    orderBy: { period: 'asc' },
  });
  const nowMin = jst.hour * 60 + jst.minute;
  let nextAssigned = false;
  return rows.map((r) => {
    const t = periodTimes(r.period);
    let status: ScheduleStatus;
    if (t.startMin >= 0 && nowMin >= t.startMin && nowMin < t.endMin) {
      status = 'live';
    } else if (t.startMin >= 0 && nowMin < t.startMin) {
      status = nextAssigned ? 'upcoming' : 'next';
      nextAssigned = true;
    } else {
      status = 'done';
    }
    return {
      timetableId: r.id,
      period: r.period,
      start: t.start,
      end: t.end,
      startMin: t.startMin,
      name: r.className,
      room: r.room ?? '',
      status,
    };
  });
}

/* ── 週間時間割グリッド ───────────────────────────────── */
export interface WeekCell {
  name: string;
  room: string;
}

export async function getWeekGrid(userId: string): Promise<{ grid: (WeekCell | null)[][]; maxPeriod: number }> {
  const rows = await prisma.timetable.findMany({ where: { userId } });
  // WHY: 10限制。データに存在する最大時限まで表示（最低5限は常に見せる）
  const maxPeriod = Math.min(10, Math.max(5, ...rows.map((r) => r.period), 5));
  // grid[day(月=0..土=5)][period-1]
  const grid: (WeekCell | null)[][] = Array.from({ length: 6 }, () => Array<WeekCell | null>(maxPeriod).fill(null));
  for (const r of rows) {
    if (r.dayOfWeek >= 1 && r.dayOfWeek <= 6 && r.period >= 1 && r.period <= maxPeriod) {
      grid[r.dayOfWeek - 1][r.period - 1] = { name: r.className, room: r.room ?? '' };
    }
  }
  return { grid, maxPeriod };
}

/** 表示中の時限リスト（開始時刻付き） */
export function periodList(maxPeriod: number): { p: string; t: string }[] {
  return Array.from({ length: maxPeriod }, (_, i) => {
    const t = PERIOD_START_TIMES[i + 1];
    return { p: String(i + 1), t: t ? `${t.hour}:${two(t.minute)}` : '' };
  });
}

/* ── お知らせ ─────────────────────────────────────────── */
export interface NewsRow {
  id: string;
  channel: Channel;
  channelLabel: string;
  title: string;
  snippet: string;
  time: string;
  unread: boolean;
  url: string | null;
}

const CHANNEL_OF_SOURCE: Record<string, Channel> = { 'cit-portal': 'cit', manaba: 'manaba', mail: 'mail' };

export function relativeTime(date: Date, now = new Date()): string {
  const min = Math.floor((now.getTime() - date.getTime()) / 60000);
  if (min < 1) return 'たった今';
  if (min < 60) return `${min}分前`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}時間前`;
  const d = Math.floor(h / 24);
  if (d === 1) return '昨日';
  if (d < 7) return `${d}日前`;
  const jst = getJstParts(date);
  return `${jst.month}/${jst.day}`;
}

export async function getNotifications(userId: string, limit = 50, now = new Date()): Promise<NewsRow[]> {
  const list = await prisma.notification.findMany({
    where: { userId },
    orderBy: { publishedAt: 'desc' },
    take: limit,
  });
  return list.map((n) => {
    const channel = CHANNEL_OF_SOURCE[n.source] ?? 'cit';
    const body = n.body.replace(/\s+/g, ' ').trim();
    return {
      id: n.id,
      channel,
      channelLabel: CHANNEL_LABEL[channel],
      title: n.title,
      snippet: body.length > 80 ? `${body.slice(0, 80)}…` : body,
      time: relativeTime(n.publishedAt, now),
      unread: !n.isRead,
      url: n.originalUrl,
    };
  });
}

export async function getUnreadCount(userId: string): Promise<number> {
  return prisma.notification.count({ where: { userId, isRead: false } });
}

/* ── 課題 ─────────────────────────────────────────────── */
export interface AssignmentRow {
  id: string;
  course: string;
  title: string;
  due: string;
  left: string | null;
  status: AssignmentStatus;
  url: string;
}

function humanDiff(ms: number): string {
  const h = Math.floor(Math.abs(ms) / 3600000);
  if (h < 1) return `${Math.max(1, Math.floor(Math.abs(ms) / 60000))}分`;
  if (h < 24) return `${h}時間`;
  return `${Math.floor(h / 24)}日`;
}

export async function getAssignments(userId: string, now = new Date()): Promise<AssignmentRow[]> {
  const list = await prisma.assignment.findMany({
    where: { userId },
    orderBy: [{ isCompleted: 'asc' }, { dueDate: 'asc' }],
  });
  return list.map((a) => {
    let status: AssignmentStatus;
    let left: string | null = null;
    if (a.isCompleted) {
      status = 'submitted';
    } else if (a.dueDate && a.dueDate.getTime() < now.getTime()) {
      status = 'overdue';
      left = `${humanDiff(now.getTime() - a.dueDate.getTime())} 超過`;
    } else if (a.dueDate) {
      const remain = a.dueDate.getTime() - now.getTime();
      status = remain < 48 * 3600000 ? 'urgent' : 'pending';
      left = `あと${humanDiff(remain)}`;
    } else {
      status = 'pending';
    }
    let due = '期限なし';
    if (a.dueDate) {
      const j = getJstParts(a.dueDate);
      due = `${j.month}月${j.day}日 (${WD[j.dayOfWeek]}) ${two(j.hour)}:${two(j.minute)}`;
    }
    return { id: a.id, course: a.courseName, title: a.title, due, left, status, url: a.url };
  });
}

/* ── 出席状況 ─────────────────────────────────────────── */
export interface CourseAttendance {
  name: string;
  attended: number;
  total: number;
  absent: number;
  pct: number;
}

export interface AttendanceOverview {
  overallPct: number | null;
  attempts: number;
  totalAbsent: number;
  courses: CourseAttendance[];
}

export async function getAttendanceOverview(userId: string, days = 120): Promise<AttendanceOverview> {
  const since = new Date();
  since.setDate(since.getDate() - days);
  const logs = await prisma.attendanceLog.findMany({
    // WHY: pending(claim行)/skipped は出席試行ではないため成功率の分母に入れない
    where: { userId, classDate: { gte: since }, status: { in: ['success', 'failed'] } },
    select: { status: true, timetable: { select: { className: true } } },
  });
  const map = new Map<string, { attended: number; total: number }>();
  let success = 0;
  for (const l of logs) {
    const c = map.get(l.timetable.className) ?? { attended: 0, total: 0 };
    c.total++;
    if (l.status === 'success') {
      c.attended++;
      success++;
    }
    map.set(l.timetable.className, c);
  }
  const courses = [...map.entries()]
    .map(([name, v]) => ({
      name,
      attended: v.attended,
      total: v.total,
      absent: v.total - v.attended,
      pct: Math.round((v.attended / v.total) * 100),
    }))
    .sort((a, b) => a.pct - b.pct || b.total - a.total);
  const attempts = logs.length;
  return {
    overallPct: attempts > 0 ? Math.round((success / attempts) * 100) : null,
    attempts,
    totalAbsent: attempts - success,
    courses,
  };
}

/** 今日すでに出席記録(success)がある timetableId 一覧 */
export async function getTodayAttendedIds(userId: string, now = new Date()): Promise<string[]> {
  const classDate = new Date(formatJstYmd(now));
  const logs = await prisma.attendanceLog.findMany({
    where: { userId, classDate, status: 'success' },
    select: { timetableId: true },
  });
  return [...new Set(logs.map((l) => l.timetableId))];
}
