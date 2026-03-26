/**
 * 出席ジョブ
 *
 * WHY: 授業開始5分前にスケジューラから投入される。
 * 教室のroomIdから出席URLを構築し、ログイン→出席登録を自動実行する。
 * 結果はAttendanceLogに記録し、Push通知でユーザーに報告する。
 */
import { Worker, Queue } from 'bullmq';
import { redis } from '../lib/redis';
import { prisma } from '@chibatech/db';
import { createAttendanceAdapter } from '../scrapers/adapter-factory';
import { getMasterKey, withDecryptedCredentials } from '@chibatech/shared';

export const ATTENDANCE_QUEUE_NAME = 'attendance';

export const attendanceQueue = new Queue(ATTENDANCE_QUEUE_NAME, {
  connection: redis,
});

interface AttendanceJobData {
  userId: string;
  timetableId: string;
  roomId: string;
  className: string;
  encryptedCreds: Buffer;
}

export function startAttendanceWorker() {
  const adapter = createAttendanceAdapter();

  const worker = new Worker<AttendanceJobData>(
    ATTENDANCE_QUEUE_NAME,
    async (job) => {
      const { userId, timetableId, roomId, className, encryptedCreds } = job.data;

      // WHY: CIT_Wi-Fiからのみアクセス可能なのでヘルスチェックで到達性確認
      const healthy = await adapter.healthCheck();
      if (!healthy) {
        await saveLog(userId, timetableId, 'failed', 'auto', '出席システムに到達できません（学内ネットワーク外の可能性）');
        await notifyUser(userId, className, false, '出席システムに接続できませんでした');
        return;
      }

      const masterKey = getMasterKey();

      try {
        await withDecryptedCredentials(
          Buffer.from(encryptedCreds),
          masterKey,
          async (creds) => {
            const result = await adapter.attend(creds.userId, creds.password, roomId);

            await saveLog(
              userId,
              timetableId,
              result.success ? 'success' : 'failed',
              'auto',
              result.success ? undefined : result.message
            );

            await notifyUser(userId, className, result.success, result.message);

            console.log(`[attendance] ${className} (room ${roomId}): ${result.success ? 'SUCCESS' : 'FAILED'} - ${result.message}`);
          }
        );
      } finally {
        masterKey.fill(0);
      }
    },
    {
      connection: redis,
      concurrency: 3,
    }
  );

  worker.on('failed', (job, err) => {
    console.error(`[attendance] Job ${job?.id} failed:`, err.message);
  });

  return worker;
}

async function saveLog(
  userId: string,
  timetableId: string,
  status: string,
  method: string,
  errorDetail?: string
) {
  await prisma.attendanceLog.create({
    data: {
      userId,
      timetableId,
      classDate: new Date(),
      status,
      method,
      errorDetail,
    },
  });
}

async function notifyUser(userId: string, className: string, success: boolean, message: string) {
  const { notifyQueue } = await import('./notify-job');
  await notifyQueue.add('push', {
    userId,
    notifications: [{
      title: success ? `${className} 出席完了` : `${className} 出席失敗`,
      source: 'attendance',
    }],
  });
}
