/**
 * スクレイピングジョブ
 *
 * WHY: BullMQのリピートジョブとして15分間隔で実行。
 * 各ユーザーのCIT Portal/manabaから最新お知らせを取得し、
 * 差分検出→DB保存→通知送信を行う。
 */
import { Worker, Queue } from 'bullmq';
import { redis } from '../lib/redis';
import { createAdapter } from '../scrapers/adapter-factory';
import { diffAndSave } from '../services/diff-engine';
import {
  getMasterKey,
  withDecryptedCredentials,
  type ScraperSession,
} from '@chibatech/shared';

export const SCRAPE_QUEUE_NAME = 'scrape';

export const scrapeQueue = new Queue(SCRAPE_QUEUE_NAME, {
  connection: redis,
});

interface ScrapeJobData {
  userId: string;
  target: 'cit-portal' | 'manaba';
  encryptedCreds: Buffer;
}

export function startScrapeWorker() {
  const worker = new Worker<ScrapeJobData>(
    SCRAPE_QUEUE_NAME,
    async (job) => {
      const { userId, target, encryptedCreds } = job.data;
      const adapter = createAdapter(target);

      // WHY: ヘルスチェックで外部システムの稼働を確認してからログインする
      const healthy = await adapter.healthCheck();
      if (!healthy) {
        console.warn(`[${target}] System is down, skipping scrape for user ${userId}`);
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
      connection: redis,
      concurrency: 5,
    }
  );

  worker.on('failed', (job, err) => {
    // WHY: エラーログに認証情報が含まれないよう、メッセージのみ出力
    console.error(`[scrape] Job ${job?.id} failed:`, err.message);
  });

  return worker;
}
