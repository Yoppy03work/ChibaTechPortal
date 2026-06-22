/**
 * CitPortalClass → ScrapedTimetableEntry への変換。
 *
 * WHY: 移植した cit-portal-scraper は連続コマを 1 行 (period..endPeriod) にマージした
 * CitPortalClass を返すが、ChibaTechPortal の Timetable は @@unique([userId,dayOfWeek,period])
 * の「1 限 1 行」モデル。よってマージ範囲を per-period 行に展開して ScrapedTimetableEntry
 * (dayOfWeek/period/className/room/classId) に落とす。
 *
 * dayOfWeek: CitPortalClass は 月=1..土=6。ScrapedTimetableEntry は 0=日..6=土 で、
 * 月〜土の数値 (1..6) は一致するためそのまま渡せる (日曜の授業は UNIPA 上存在しない)。
 */
import type { ScrapedTimetableEntry } from '@chibatech/shared';
import type { CitPortalClass } from './cit-portal-scraper';

export function citPortalClassToScrapedEntries(
  classes: CitPortalClass[]
): ScrapedTimetableEntry[] {
  const out: ScrapedTimetableEntry[] = [];
  for (const c of classes) {
    const start = c.period;
    const end = Number.isFinite(c.endPeriod) && c.endPeriod >= c.period ? c.endPeriod : c.period;
    for (let p = start; p <= end; p++) {
      out.push({
        dayOfWeek: c.dayOfWeek,
        period: p,
        className: c.courseName,
        room: c.classroom ?? null,
        classId: null,
      });
    }
  }
  return out;
}
