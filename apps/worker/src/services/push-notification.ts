/**
 * Web Push通知サービス
 *
 * WHY: VAPIDプロトコルでブラウザにPush通知を送信する。
 * ユーザーのPushSubscription（endpoint + keys）をDBから取得し、
 * web-pushライブラリで通知を送信する。
 */
import webPush from 'web-push';
import { prisma } from '@chibatech/db';

// WHY: VAPID鍵は起動時に1回だけ設定
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '';
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:admin@example.com';

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webPush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  source?: string;
}

/**
 * 指定ユーザーの全デバイスにPush通知を送信する
 */
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<void> {
  const subscriptions = await prisma.pushSubscription.findMany({
    where: { userId },
  });

  if (subscriptions.length === 0) return;

  const notificationPayload = JSON.stringify({
    title: payload.title,
    body: payload.body,
    data: {
      url: payload.url || '/',
      source: payload.source,
    },
  });

  const results = await Promise.allSettled(
    subscriptions.map(async (sub: { id: string; endpoint: string; p256dh: string; auth: string }) => {
      try {
        await webPush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: {
              p256dh: sub.p256dh,
              auth: sub.auth,
            },
          },
          notificationPayload,
          { TTL: 60 * 60 } // 1時間有効
        );
      } catch (error) {
        // WHY: 410 Gone / 404 Not Found = サブスクリプション失効 → DB から削除して終了。
        // handled なので re-throw せず、失敗カウントにも含めない (dead subscription の掃除)。
        if (
          error instanceof webPush.WebPushError &&
          (error.statusCode === 410 || error.statusCode === 404)
        ) {
          await prisma.pushSubscription.delete({ where: { id: sub.id } });
          console.log(
            `[push] Removed gone subscription ${sub.id} (status ${error.statusCode})`
          );
          return;
        }
        throw error;
      }
    })
  );

  const failed = results.filter((r) => r.status === 'rejected').length;
  if (failed > 0) {
    console.warn(`[push] ${failed}/${subscriptions.length} notifications failed for user ${userId}`);
  }
}
