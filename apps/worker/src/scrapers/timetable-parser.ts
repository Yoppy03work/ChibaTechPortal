/**
 * UNIPA 時間割ページ (Kmd00801.xhtml) の HTML パーサ
 *
 * WHY: CIT Portal/UNIPA の履修・時間割ページから各コマ (曜日・時限・授業名・教室) を抽出する。
 * 取得 (fetch) と解析を分離し、解析は実 HTML 構造に対して単体テスト可能にする。
 *
 * 構造 (2026-06 実ページで確認):
 *   table.classTable
 *     thead > th.headerYobi : 曜日 (月曜日..土曜日)
 *     tbody > tr            : 時限行。先頭 td.colJigen = 時限番号、続く td.colYobi = 各曜日
 *     授業セル: div.jugyo-info (空きは .noClass)。.fontB=授業名、最初の span=教室。
 */
import { load } from 'cheerio';
import type { ScrapedTimetableEntry } from '@chibatech/shared';

const DAY_MAP: Record<string, number> = {
  日曜日: 0,
  月曜日: 1,
  火曜日: 2,
  水曜日: 3,
  木曜日: 4,
  金曜日: 5,
  土曜日: 6,
};

export function parseTimetableHtml(html: string): ScrapedTimetableEntry[] {
  const $ = load(html);
  const table = $('table.classTable').first();
  if (table.length === 0) return [];

  // thead の曜日カラム順 → dayOfWeek の配列 (td.colYobi のインデックスに対応)
  const dayCols: number[] = [];
  table.find('thead th.headerYobi').each((_, th) => {
    dayCols.push(DAY_MAP[$(th).text().trim()] ?? -1);
  });

  const entries: ScrapedTimetableEntry[] = [];
  table.find('tbody tr').each((_, tr) => {
    const $tr = $(tr);
    const period = parseInt($tr.find('td.colJigen').first().text().trim(), 10);
    if (!Number.isInteger(period)) return;

    $tr.find('td.colYobi').each((idx, td) => {
      const dayOfWeek = dayCols[idx];
      if (dayOfWeek === undefined || dayOfWeek < 0) return;

      const $info = $(td).find('div.jugyo-info').first();
      if ($info.length === 0 || $info.hasClass('noClass')) return;

      const className = $info.find('.fontB').first().text().trim();
      if (!className) return;

      // WHY: 教室はセル内の最初の span (例 "７３１講義室" / "オンライン")。
      const room = $info.find('span').first().text().trim() || null;

      entries.push({ dayOfWeek, period, className, room, classId: null });
    });
  });

  return entries;
}
