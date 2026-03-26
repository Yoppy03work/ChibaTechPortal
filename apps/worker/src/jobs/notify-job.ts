/**
 * 通知ジョブ
 *
 * WHY: スクレイピングで新着が検出された場合、Push通知+メール送信を行う。
 * スクレイピングジョブとは別キューで非同期実行し、通知の遅延がスクレイピングに影響しないようにする。
 */
import { Worker, Queue } from 'bullmq';
import { bullmqConnection } from '../lib/redis';
import { prisma } from '@chibatech/db';
import { sendPushToUser } from '../services/push-notification';
import { sendEmail } from '../services/email-notification';
import { notificationEmail } from '@chibatech/email-templates';

export const NOTIFY_QUEUE_NAME = 'notify';

export const notifyQueue = new Queue(NOTIFY_QUEUE_NAME, {
  connection: bullmqConnection,
});

interface NotifyJobData {
  userId: string;
  notifications: Array<{
    title: string;
    source: string;
  }>;
}

export function startNotifyWorker() {
  const worker = new Worker<NotifyJobData>(
    NOTIFY_QUEUE_NAME,
    async (job) => {
      const { userId, notifications } = job.data;

      // ユーザーの通知設定を取得
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { email: true, notificationSettings: true },
      });

      const settings = (user?.notificationSettings as {
        pushEnabled?: boolean;
        emailEnabled?: boolean;
        sources?: string[];
        quietHoursStart?: string;
        quietHoursEnd?: string;
      } | null) ?? { pushEnabled: true, emailEnabled: true, sources: ['cit-portal', 'manaba'] };

      // WHY: おやすみモード中は通知を抑制
      if (isQuietHours(settings.quietHoursStart, settings.quietHoursEnd)) {
        console.log(`[notify] User ${userId}: quiet hours, skipping`);
        return;
      }

      // WHY: ユーザーが通知元を絞っている場合、対象外のsourceはスキップ
      const allowedSources = settings.sources ?? ['cit-portal', 'manaba'];

      for (const notif of notifications) {
        if (!allowedSources.includes(notif.source) && notif.source !== 'attendance') {
          console.log(`[notify] User ${userId}: source "${notif.source}" not in allowed sources, skipping`);
          continue;
        }
        // WHY: sourceを厳密にマッピング。未知のsourceはそのまま表示し、誤った表示を防ぐ
        const SOURCE_DISPLAY_NAMES: Record<string, string> = {
          'cit-portal': 'CIT Portal',
          'manaba': 'manaba',
          'attendance': '出席システム',
        };
        const sourceName = SOURCE_DISPLAY_NAMES[notif.source] ?? notif.source;

        // Push通知
        if (settings.pushEnabled !== false) {
          try {
            await sendPushToUser(userId, {
              title: `${sourceName}: ${notif.title}`,
              body: notif.title,
              source: notif.source,
            });
          } catch (err) {
            console.error(`[notify] Push failed for ${userId}:`, err instanceof Error ? err.message : err);
          }
        }

        // メール通知
        if (settings.emailEnabled !== false && user?.email) {
          try {
            const email = notificationEmail({
              title: notif.title,
              source: sourceName,
              publishedAt: new Date().toLocaleString('ja-JP'),
              body: '', // 概要はスクレイピング時に取得
              originalUrl: '',
              portalUrl: `https://chibatech-portal.example.com/notifications`,
            });
            await sendEmail({
              to: user.email,
              ...email,
            });
          } catch (err) {
            console.error(`[notify] Email failed for ${userId}:`, err instanceof Error ? err.message : err);
          }
        }

        console.log(`[notify] User ${userId}: "${notif.title}" (${notif.source})`);
      }
    },
    {
      connection: bullmqConnection,
      concurrency: 10,
    }
  );

  worker.on('failed', (job, err) => {
    console.error(`[notify] Job ${job?.id} failed:`, err.message);
  });

  return worker;
}

/**
 * 現在がおやすみモード中かチェック
 */
function isQuietHours(start?: string, end?: string): boolean {
  if (!start || !end) return false;

  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  const [startH, startM] = start.split(':').map(Number);
  const [endH, endM] = end.split(':').map(Number);
  const startMinutes = (startH ?? 0) * 60 + (startM ?? 0);
  const endMinutes = (endH ?? 0) * 60 + (endM ?? 0);

  // WHY: 22:00〜07:00 のような日をまたぐケースに対応
  if (startMinutes > endMinutes) {
    return currentMinutes >= startMinutes || currentMinutes < endMinutes;
  }
  return currentMinutes >= startMinutes && currentMinutes < endMinutes;
}
