/**
 * 時間割同期サービス
 *
 * WHY: スクレイピングで取得した時間割を Timetable に反映する。ユーザーの手動編集
 * (source='manual') は上書き/削除せず保護し、scrape 由来 (source='scraped') の行だけを
 * 同期する（新規 create / 既存 update / scrape から消えた行は delete）。
 *
 * 注: 実際のスクレイパー (CitPortalHttpAdapter.fetchTimetable) は UNIPA 時間割ページの
 * 実 HTML に基づいて別途実装する。本サービスはその出力 (ScrapedTimetableEntry[]) を
 * 受け取って DB に反映する純粋な同期ロジック。
 */
import { prisma } from '@chibatech/db';
import type { ScrapedTimetableEntry } from '@chibatech/shared';

export interface TimetableSyncResult {
  created: number;
  updated: number;
  removed: number;
  skippedManual: number;
}

const slotKey = (dayOfWeek: number, period: number) => `${dayOfWeek}-${period}`;

export async function syncTimetable(
  userId: string,
  entries: ScrapedTimetableEntry[]
): Promise<TimetableSyncResult> {
  const existing = await prisma.timetable.findMany({
    where: { userId },
    select: { id: true, dayOfWeek: true, period: true, source: true },
  });
  const existingByKey = new Map(
    existing.map((e: { id: string; dayOfWeek: number; period: number; source: string }) => [
      slotKey(e.dayOfWeek, e.period),
      e,
    ])
  );
  const scrapedKeys = new Set(entries.map((e) => slotKey(e.dayOfWeek, e.period)));

  const result: TimetableSyncResult = {
    created: 0,
    updated: 0,
    removed: 0,
    skippedManual: 0,
  };

  for (const entry of entries) {
    const ex = existingByKey.get(slotKey(entry.dayOfWeek, entry.period));
    // WHY: 手動登録は保護 (上書きしない)
    if (ex && ex.source === 'manual') {
      result.skippedManual++;
      continue;
    }
    if (ex) {
      await prisma.timetable.update({
        where: { id: ex.id },
        data: {
          className: entry.className,
          room: entry.room,
          classId: entry.classId,
          source: 'scraped',
        },
      });
      result.updated++;
    } else {
      await prisma.timetable.create({
        data: {
          userId,
          dayOfWeek: entry.dayOfWeek,
          period: entry.period,
          className: entry.className,
          room: entry.room,
          classId: entry.classId,
          source: 'scraped',
        },
      });
      result.created++;
    }
  }

  // WHY: scrape から消えた scraped 行は削除する（manual は残す = 保護）
  for (const ex of existing) {
    if (ex.source === 'scraped' && !scrapedKeys.has(slotKey(ex.dayOfWeek, ex.period))) {
      await prisma.timetable.delete({ where: { id: ex.id } });
      result.removed++;
    }
  }

  return result;
}
