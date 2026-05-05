/**
 * 出席ジョブ
 *
 * WHY: 授業開始5分前にスケジューラから投入される。
 * 教室のroomIdから出席URLを構築し、ログイン→出席登録を自動実行する。
 * 結果はAttendanceLogに記録し、Push通知でユーザーに報告する。
 * キューにはIDと教室情報のみ載せ、認証情報はworker側でDB取得・復号する。
 *
 * 外部アクセス (adapter.healthCheck / adapter.attend) は pre-network guard が
 * 通過した後にだけ呼ぶ。env disabled / qrSessionValid=false / 条件不足の
 * 段階では adapter には一切触れない (外部システム実アクセス禁止ルール)。
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
  evaluateAttendanceAutoGuardPreNetwork,
} from '@chibatech/shared';
import type {
  AttendanceMode,
  AttendanceAutoGuardPreNetworkInput,
} from '@chibatech/shared';

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

// WHY: テストで adapter をモック注入するため processAttendanceJob を export し、
// adapter は引数で渡す形にする。startAttendanceWorker は本番起動経路のみ担当。
export type AttendanceAdapter = ReturnType<typeof createAttendanceAdapter>;

export interface ProcessAttendanceJobInput {
  id?: string;
  data: unknown;
}

/**
 * BullMQ ジョブを処理する。adapter への接触は pre-network guard が通過した
 * 後にのみ発生する。
 */
export async function processAttendanceJob(
  job: ProcessAttendanceJobInput,
  adapter: AttendanceAdapter
): Promise<void> {
  // 1. zod でジョブデータを検証
  // WHY: 古い形式の残留ジョブや手動投入の不正ジョブを即 throw して
  // BullMQ に失敗を伝える。
  const parsed = attendanceJobDataSchema.safeParse(job.data);
  if (!parsed.success) {
    console.error(
      `[attendance] invalid job data id=${job.id}:`,
      parsed.error.flatten()
    );
    throw new Error('Invalid attendance job data');
  }
  const { userId, timetableId, roomId } = parsed.data;
  // WHY: method 未指定の旧ジョブは 'auto' として扱う (Scheduler 解禁前は
  // 実質ここに来るのは将来の経路のみ)。
  const method: AttendanceMode = parsed.data.method ?? 'auto';
  const now = new Date();
  const classDate = toClassDate(now);

  // 2. timetable を取得 (DB のみ)
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

  // 3. 同日同方式の成功ログ重複を確認 (DB のみ)
  const existingSuccess = await prisma.attendanceLog.findFirst({
    where: {
      userId,
      timetableId,
      classDate,
      status: 'success',
    },
  });

  // 4. pre-network guard (DB / 内部状態のみで判定)
  // WHY: ここで reject される入力では adapter.healthCheck() も呼ばない。
  // env disabled / qrSessionValid=false など外部アクセス前に確定する条件で
  // 実 HTTP を出さないようにする。
  const guardInput: AttendanceAutoGuardPreNetworkInput = {
    // WHY: server 側の明示的キルスイッチ。QR セッション検証 DB が入るまで
    // true にしても qrSessionValid=false により自動送信は解禁されない。
    autoExecutionEnabled: process.env.ATTENDANCE_AUTO_EXECUTION_ENABLED === 'true',
    method,
    storedMode: normalizeAttendanceSettings(timetable.user.attendanceSettings).mode,
    timetableUserId: timetable.userId,
    jobUserId: userId,
    timetableRoom: timetable.room,
    jobRoomId: roomId,
    dayOfWeek: timetable.dayOfWeek,
    period: timetable.period,
    now,
    alreadySubmitted: !!existingSuccess,
    qrSessionValid: false,
  };

  const preGuard = evaluateAttendanceAutoGuardPreNetwork(guardInput);
  if (!preGuard.allowed) {
    const reason = sanitizeExternalText(preGuard.reason);
    await saveLog(userId, timetableId, 'skipped', method, reason, classDate);
    await notifyUser(userId, displayClassName, false, reason);
    console.warn(`[attendance] skipped (pre-network) job id=${job.id}: ${reason}`);
    return;
  }

  // 5. healthCheck — ここで初めて外部アクセス
  // 注意: フェーズ 0 では preGuard が qrSessionValid=false で必ず reject する
  // ため、この行に到達することはない。auto dry-run / allowlist 段階で初めて
  // 意味を持つ。
  const healthy = await adapter.healthCheck();

  // 6. 完全 guard (campusReachable 含む)
  const guard = evaluateAttendanceAutoGuard({
    ...guardInput,
    campusReachable: healthy,
  });
  if (!guard.allowed) {
    const reason = sanitizeExternalText(guard.reason);
    await saveLog(userId, timetableId, 'skipped', method, reason, classDate);
    await notifyUser(userId, displayClassName, false, reason);
    console.warn(`[attendance] skipped job id=${job.id}: ${reason}`);
    return;
  }

  // 7. 認証情報チェック
  if (!timetable.user.encryptedCitCreds) {
    await saveLog(userId, timetableId, 'failed', method, '認証情報が未登録です', classDate);
    await notifyUser(userId, displayClassName, false, '認証情報が未登録です');
    return;
  }

  // 8. 復号 + attend (実送信)
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
}

export function startAttendanceWorker() {
  const adapter = createAttendanceAdapter();

  const worker = new Worker<AttendanceJobData>(
    ATTENDANCE_QUEUE_NAME,
    (job) => processAttendanceJob(job, adapter),
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
