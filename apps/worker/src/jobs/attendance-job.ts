/**
 * 出席ジョブ
 *
 * WHY: 授業開始5分前にスケジューラから投入される。
 * 教室のroomIdから出席URLを構築し、ログイン→出席登録を自動実行する。
 * 結果はAttendanceLogに記録し、Push通知でユーザーに報告する。
 * キューにはIDと教室情報のみ載せ、認証情報はworker側でDB取得・復号する。
 */
import { Worker, Queue } from 'bullmq';
import { z } from 'zod';
import { bullmqConnection } from '../lib/redis';
import { prisma } from '@chibatech/db';
import { createAttendanceAdapter } from '../scrapers/adapter-factory';
import {
  getMasterKey,
  withDecryptedCredentials,
  sanitizeExternalText,
  attendanceModeSchema,
  normalizeAttendanceSettings,
  evaluateAttendanceAutoGuard,
} from '@chibatech/shared';
import type { AttendanceMode } from '@chibatech/shared';

export const ATTENDANCE_QUEUE_NAME = 'attendance';

export const attendanceQueue = new Queue(ATTENDANCE_QUEUE_NAME, {
  connection: bullmqConnection,
});

// WHY: BullMQ の job.data はキューに載った時点で型保証がない。
// 取り出し時に zod で検証することで「古い型のジョブが走り続ける / method 決め打ち」を防ぐ。
const attendanceJobDataSchema = z.object({
  userId: z.string().min(1),
  timetableId: z.string().min(1),
  roomId: z.string().min(1),
  className: z.string().min(1),
  // WHY: 後方互換のため optional。未指定時は 'auto'（旧来の Scheduler 経路）扱い
  method: attendanceModeSchema.optional(),
});

type AttendanceJobData = z.infer<typeof attendanceJobDataSchema>;

export function startAttendanceWorker() {
  const adapter = createAttendanceAdapter();

  const worker = new Worker<AttendanceJobData>(
    ATTENDANCE_QUEUE_NAME,
    async (job) => {
      // WHY: 取り出し時に zod で検証。型違反のジョブは即 throw して BullMQ に
      // 失敗を伝える（古い形式の残留ジョブを誤って実行しない）。
      const parsed = attendanceJobDataSchema.safeParse(job.data);
      if (!parsed.success) {
        console.error(
          `[attendance] invalid job data id=${job.id}:`,
          parsed.error.flatten()
        );
        throw new Error('Invalid attendance job data');
      }
      const { userId, timetableId, roomId } = parsed.data;
      // WHY: method 未指定の旧ジョブは 'auto' として扱う（Scheduler 解禁前の経路は
      // PR4 までキューに乗らないため、実質ここに来るのは将来の経路のみ）。
      const method: AttendanceMode = parsed.data.method ?? 'auto';
      const now = new Date();
      const classDate = toClassDate(now);

      // WHY: CIT_Wi-Fiからのみアクセス可能なのでヘルスチェックで到達性確認
      const healthy = await adapter.healthCheck();

      const timetable = await prisma.timetable.findUnique({
        where: { id: timetableId },
        select: {
          id: true,
          userId: true,
          dayOfWeek: true,
          period: true,
          room: true,
          className: true,
          user: {
            select: {
              encryptedCitCreds: true,
              attendanceSettings: true,
            },
          },
        },
      });

      if (!timetable) {
        console.warn(`[attendance] timetable not found for job id=${job.id}`);
        return;
      }
      const displayClassName = sanitizeExternalText(timetable.className);

      const existingSuccess = await prisma.attendanceLog.findFirst({
        where: {
          userId,
          timetableId,
          classDate,
          status: 'success',
        },
      });

      const guard = evaluateAttendanceAutoGuard({
        // WHY: server側の明示的キルスイッチ。QRセッション検証のDB設計が入るまで
        // true にしても qrSessionValid=false により自動送信は解禁されない。
        autoExecutionEnabled: process.env.ATTENDANCE_AUTO_EXECUTION_ENABLED === 'true',
        method,
        storedMode: normalizeAttendanceSettings(timetable.user.attendanceSettings).mode,
        campusReachable: healthy,
        timetableUserId: timetable.userId,
        jobUserId: userId,
        timetableRoom: timetable.room,
        jobRoomId: roomId,
        dayOfWeek: timetable.dayOfWeek,
        period: timetable.period,
        now,
        alreadySubmitted: !!existingSuccess,
        qrSessionValid: false,
      });

      if (!guard.allowed) {
        const reason = sanitizeExternalText(guard.reason);
        await saveLog(userId, timetableId, 'skipped', method, reason, classDate);
        await notifyUser(userId, displayClassName, false, reason);
        console.warn(`[attendance] skipped job id=${job.id}: ${reason}`);
        return;
      }

      if (!timetable.user.encryptedCitCreds) {
        await saveLog(userId, timetableId, 'failed', method, '認証情報が未登録です', classDate);
        await notifyUser(userId, displayClassName, false, '認証情報が未登録です');
        return;
      }

      const masterKey = getMasterKey();

      try {
        await withDecryptedCredentials(
          Buffer.from(timetable.user.encryptedCitCreds),
          masterKey,
          async (creds) => {
            const result = await adapter.attend(creds.userId, creds.password, roomId);

            // WHY: 外部HTML由来のメッセージはサニタイズしてからDB保存
            const sanitizedMessage = result.message ? sanitizeExternalText(result.message) : undefined;

            await saveLog(
              userId,
              timetableId,
              result.success ? 'success' : 'failed',
              method,
              result.success ? undefined : sanitizedMessage,
              classDate
            );

            await notifyUser(userId, displayClassName, result.success, result.message);

            console.log(`[attendance] ${displayClassName} (room ${roomId}) [${method}]: ${result.success ? 'SUCCESS' : 'FAILED'} - ${sanitizedMessage ?? 'OK'}`);
          }
        );
      } finally {
        masterKey.fill(0);
      }
    },
    {
      connection: bullmqConnection,
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
  method: AttendanceMode,
  errorDetail?: string,
  classDate = toClassDate(new Date())
) {
  const updated = await prisma.attendanceLog.updateMany({
    where: { userId, timetableId, classDate, method },
    data: {
      status,
      attemptedAt: new Date(),
      errorDetail,
    },
  });

  if (updated.count > 0) return;

  try {
    await prisma.attendanceLog.create({
      data: {
        userId,
        timetableId,
        classDate,
        status,
        method,
        errorDetail,
      },
    });
  } catch {
    // WHY: 並列Workerで create が競合した場合でもDB一意制約を最後の防壁にし、
    // 重複ログを増やさず最新状態へ収束させる。
    await prisma.attendanceLog.updateMany({
      where: { userId, timetableId, classDate, method },
      data: {
        status,
        attemptedAt: new Date(),
        errorDetail,
      },
    });
  }
}

function toClassDate(date: Date): Date {
  const classDate = new Date(date);
  classDate.setHours(0, 0, 0, 0);
  return classDate;
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
