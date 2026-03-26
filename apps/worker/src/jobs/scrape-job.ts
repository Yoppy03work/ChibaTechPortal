/**
 * スクレイピングジョブ
 *
 * WHY: BullMQのリピートジョブとして15分間隔で実行。
 * 各ユーザーのCIT Portal/manabaから最新お知らせを取得し、
 * 差分検出→DB保存→通知送信を行う。
 * キューにはuserIdとtargetのみ載せ、認証情報はworker側でDB取得・復号する。
 */
import { Worker, Queue } from 'bullmq';
import { bullmqConnection } from '../lib/redis';
import { prisma } from '@chibatech/db';
import { createAdapter } from '../scrapers/adapter-factory';
import { diffAndSave } from '../services/diff-engine';
import {
  getMasterKey,
  withDecryptedCredentials,
  type ScraperSession,
} from '@chibatech/shared';

export const SCRAPE_QUEUE_NAME = 'scrape';

export const scrapeQueue = new Queue(SCRAPE_QUEUE_NAME, {
  connection: bullmqConnection,
});

interface ScrapeJobData {
  userId: string;
  target: 'cit-portal' | 'manaba';
}

export function startScrapeWorker() {
  const worker = new Worker<ScrapeJobData>(
    SCRAPE_QUEUE_NAME,
    async (job) => {
      const { userId, target } = job.data;
      const adapter = createAdapter(target);

      // WHY: ヘルスチェックで外部システムの稼働を確認してからログインする
      const healthy = await adapter.healthCheck();
      if (!healthy) {
        console.warn(`[${target}] System is down, skipping scrape for user ${userId}`);
        return;
      }

      // WHY: 認証情報はキューに載せず、worker側でDBから都度取得・復号する
      const credsField = target === 'cit-portal' ? 'encryptedCitCreds' : 'encryptedManabaCreds';
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { [credsField]: true },
      });

      // WHY: Prismaの動的selectは戻り値の型が広いunionになるため、unknown経由でキャスト
      const encryptedCreds = (user as Record<string, unknown> | null)?.[credsField] as Buffer | null;
      if (!encryptedCreds) {
        console.warn(`[${target}] No credentials found for user ${userId}, skipping`);
        return;
      }

      const masterKey = getMasterKey();

      try {
        await withDecryptedCredentials(
          Buffer.from(encryptedCreds),
          masterKey,
          async (creds) => {
            const session: ScraperSession = await adapter.login(creds.userId, creds.password);
            const notifications = await adapter.fetchNotifications(session);

            // 差分検出→DB保存
            const newItems = await diffAndSave(userId, target, notifications);

            if (newItems.length > 0) {
              // WHY: 新着があれば通知ジョブを投入
              const { notifyQueue } = await import('./notify-job');
              await notifyQueue.add('push', {
                userId,
                notifications: newItems.map((n) => ({
                  title: n.title,
                  source: target,
                })),
              });
            }

            console.log(`[${target}] User ${userId}: ${notifications.length} fetched, ${newItems.length} new`);
          }
        );
      } finally {
        masterKey.fill(0);
      }
    },
    {
      connection: bullmqConnection,
      concurrency: 5,
    }
  );

  worker.on('failed', (job, err) => {
    // WHY: エラーログに認証情報が含まれないよう、メッセージのみ出力
    console.error(`[scrape] Job ${job?.id} failed:`, err.message);
  });

  return worker;
}
