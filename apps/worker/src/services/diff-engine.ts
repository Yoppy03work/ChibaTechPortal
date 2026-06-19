/**
 * 差分検出エンジン
 *
 * WHY: スクレイピング結果と既存DBデータのexternalIdを比較し、
 * 新着のみをDBにINSERTする。既存のお知らせは重複保存しない。
 */
import { prisma } from '@chibatech/db';
import type { ScrapedNotificationItem, ScrapedAssignment } from '@chibatech/shared';
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

  const existingIds = new Set(existing.map((e: { externalId: string }) => e.externalId));

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

/**
 * 課題のスクレイピング結果を DB と比較し、新着のみ保存する（manaba 用）。
 *
 * WHY: お知らせと同じ externalId 差分パターンで、重複保存せず新着のみ Assignment に
 * INSERT する。@@unique([userId, externalId]) を最後の防壁にしつつ、事前に既存を
 * 一括照合して N+1 と一意制約衝突を避ける。
 *
 * @returns 新着として保存された課題の配列
 */
export async function diffAndSaveAssignments(
  userId: string,
  scraped: ScrapedAssignment[]
): Promise<ScrapedAssignment[]> {
  if (scraped.length === 0) return [];

  const externalIds = scraped.map((a) => a.externalId);

  const existing = await prisma.assignment.findMany({
    where: { userId, externalId: { in: externalIds } },
    select: { externalId: true },
  });
  const existingIds = new Set(
    existing.map((e: { externalId: string }) => e.externalId)
  );

  const newItems = scraped.filter((a) => !existingIds.has(a.externalId));
  if (newItems.length === 0) return [];

  await prisma.assignment.createMany({
    data: newItems.map((a) => ({
      userId,
      externalId: a.externalId,
      // WHY: 外部 HTML 由来は必ずサニタイズ
      title: sanitizeHtml(a.title),
      courseName: sanitizeHtml(a.courseName),
      dueDate: a.dueDate,
      url: a.url,
      isCompleted: false,
    })),
    // WHY: 並列スクレイプの競合でも一意制約違反で落とさず無視する
    skipDuplicates: true,
  });

  return newItems;
}
