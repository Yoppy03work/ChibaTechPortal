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
import { diffAndSave, diffAndSaveAssignments } from '../services/diff-engine';
import { syncTimetable } from '../services/timetable-sync';
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

            // WHY: manaba は課題も取得して Assignment に保存する (CIT Portal は課題なし)。
            // fetchAssignments は ScraperAdapter の optional メソッド。
            if (target === 'manaba' && adapter.fetchAssignments) {
              const assignments = await adapter.fetchAssignments(session);
              const newAssignments = await diffAndSaveAssignments(userId, assignments);

              if (newAssignments.length > 0) {
                const { notifyQueue } = await import('./notify-job');
                await notifyQueue.add('push', {
                  userId,
                  notifications: newAssignments.map((a) => ({
                    title: `課題: ${a.title}`,
                    source: target,
                  })),
                });
              }

              console.log(
                `[${target}] User ${userId}: ${assignments.length} assignments fetched, ${newAssignments.length} new`
              );
            }

            // WHY: CIT Portal は時間割も取得して Timetable に同期する（手動編集は保護）。
            // fetchTimetable が空（JSF 未描画の可能性）のときは sync をスキップし、取得失敗で
            // scraped 行を誤って全削除しないようにする。
            if (target === 'cit-portal' && adapter.fetchTimetable) {
              const entries = await adapter.fetchTimetable(session);
              if (entries.length > 0) {
                const r = await syncTimetable(userId, entries);
                console.log(
                  `[${target}] User ${userId}: timetable sync +${r.created}/~${r.updated}/-${r.removed} (manual保護 ${r.skippedManual})`
                );
              } else {
                console.warn(
                  `[${target}] User ${userId}: timetable 0 件（JSF 未描画の可能性、sync スキップ）`
                );
              }
            }
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
