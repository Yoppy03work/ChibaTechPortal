/**
 * 差分検出エンジン
 *
 * WHY: スクレイピング結果と既存DBデータのexternalIdを比較し、
 * 新着のみをDBにINSERTする。既存のお知らせは重複保存しない。
 */
import { prisma } from '@chibatech/db';
import type { ScrapedNotificationItem } from '@chibatech/shared';
import { sanitizeHtml } from '@chibatech/shared';

/**
 * スクレイピング結果をDBと比較し、新着のみ保存する
 * @returns 新着として保存されたお知らせの配列
 */
export async function diffAndSave(
  userId: string,
  source: string,
  scraped: ScrapedNotificationItem[]
): Promise<ScrapedNotificationItem[]> {
  if (scraped.length === 0) return [];

  // WHY: externalIdで既存データを一括照合し、N+1クエリを防ぐ
  const externalIds = scraped.map((n) => n.externalId);

  const existing = await prisma.notification.findMany({
    where: {
      userId,
      source,
      externalId: { in: externalIds },
    },
    select: { externalId: true },
  });

  const existingIds = new Set(existing.map((e) => e.externalId));

  const newItems = scraped.filter((n) => !existingIds.has(n.externalId));

  if (newItems.length === 0) return [];

  // WHY: createManyで一括INSERTし、DB往復回数を最小化
  await prisma.notification.createMany({
    data: newItems.map((n) => ({
      userId,
      source,
      // WHY: 外部HTMLから取得したデータは必ずサニタイズ
      title: sanitizeHtml(n.title),
      body: sanitizeHtml(n.body),
      // WHY: externalIdは重複判定用、originalUrlは表示用リンク。責務を分離する
      externalId: n.externalId,
      originalUrl: n.url,
      publishedAt: n.publishedAt,
      isRead: false,
    })),
  });

  return newItems;
}
