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
import { Prisma } from '@prisma/client';
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
  evaluateConfirmSubmitGuard,
  toAttendanceAuditLogCreateData,
  ATTENDANCE_QUEUE_NAME as SHARED_ATTENDANCE_QUEUE_NAME,
} from '@chibatech/shared';
import type {
  AttendanceMode,
  AttendanceAutoGuardPreNetworkInput,
  AttendanceAuditLogInput,
  ConfirmSubmitGuardInput,
} from '@chibatech/shared';

// WHY: shared から 1 つの真実 (キュー名) を import して再 export する。
// Producer (web) / Consumer (worker) の文字列ドリフトを防ぐ。
export const ATTENDANCE_QUEUE_NAME = SHARED_ATTENDANCE_QUEUE_NAME;

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
  // WHY: confirm モードの「ユーザが UI で確認した日」を Producer 側から
  // 受け継ぐ。遅延ジョブ実行時に new Date() で再計算すると別日の出席を
  // 送る (replay protection が無効化) ため、payload で運ぶのが正解。
  // ISO 8601 文字列 (YYYY-MM-DD or full ISO)。未指定時は実行時刻から算出。
  classDate: z
    .string()
    .min(1)
    .refine((s) => !Number.isNaN(Date.parse(s)), {
      message: 'classDate must be a valid ISO date string',
    })
    .optional(),
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
  // WHY: payload で classDate が来ていればそれを優先 (confirm モードの replay
  // protection)。未指定 (旧 auto Scheduler 経路) は実行時刻ベース。
  const classDate = parsed.data.classDate
    ? toClassDate(new Date(parsed.data.classDate))
    : toClassDate(now);

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
    // WHY: timetable 不在は ガード以前の段階で進行不可。append-only 監査ログに
    // blocked として記録する (AttendanceLog には書けないので audit のみ)。
    await recordAuditBestEffort({
      userId,
      phase: 'blocked',
      timetableId,
      classDate,
      method,
      reason: 'timetable not found',
      jobId: jobIdString(job.id),
    });
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

  // 4. method 別の guard (auto / confirm) を評価。reject なら共通 skip 処理へ
  // WHY: auto と confirm でガード条件が違う:
  //   - auto: env キルスイッチ + 6 条件 + healthCheck + qrSessionValid 等
  //   - confirm: timetable 所有 / room 一致 / 時刻ウィンドウ / 重複 / creds / healthCheck
  // 共通化部分は guardRejection 統一型に正規化する。
  const guardRejection = await evaluateMethodGuard({
    method,
    userId,
    timetableId,
    roomId,
    classDate,
    now,
    timetable,
    existingSuccess,
    adapter,
  });

  if (guardRejection) {
    const reason = sanitizeExternalText(guardRejection.reason);
    await saveLog(userId, timetableId, 'skipped', method, reason, classDate);
    await recordAuditBestEffort({
      userId,
      phase: 'skipped',
      timetableId,
      classDate,
      method,
      reason,
      jobId: jobIdString(job.id),
      metadata: guardRejection.metadata ?? null,
    });
    await notifyUser(userId, displayClassName, false, reason);
    console.warn(
      `[attendance] skipped (${guardRejection.stage}) job id=${job.id}: ${reason}`
    );
    return;
  }

  // 7. 認証情報チェック
  if (!timetable.user.encryptedCitCreds) {
    const reason = '認証情報が未登録です';
    await saveLog(userId, timetableId, 'failed', method, reason, classDate);
    await recordAuditBestEffort({
      userId,
      phase: 'blocked',
      timetableId,
      classDate,
      method,
      reason,
      jobId: jobIdString(job.id),
    });
    await notifyUser(userId, displayClassName, false, reason);
    return;
  }

  // 8. 復号 + attend (実送信)
  const masterKey = getMasterKey();

  try {
    await withDecryptedCredentials(
      Buffer.from(timetable.user.encryptedCitCreds),
      masterKey,
      async (creds) => {
        // WHY: 外部システムへの実 HTTP 直前の監査ログ。auto 解禁条件 4 の
        // 「送信前の監査ログが残る」を満たすため、ここは **必須記録** で扱う。
        // 失敗した場合は recordAuditRequired が throw し、adapter.attend() に
        // 到達しない (BullMQ がジョブを失敗扱いにし、リトライ時に監査込みで
        // 再実行される)。creds 自体はログに含めない。
        await recordAuditRequired({
          userId,
          phase: 'pre_attempt',
          timetableId,
          classDate,
          method,
          jobId: jobIdString(job.id),
        });

        let result;
        try {
          result = await adapter.attend(creds.userId, creds.password, roomId);
        } catch (err) {
          // WHY: adapter が throw した場合も「送信後監査ログ」を残す。
          // 例外メッセージはサニタイズしてから保存 (外部 HTML が含まれうるため)
          const errMessage =
            err instanceof Error ? sanitizeExternalText(err.message) : 'unknown error';
          await recordAuditBestEffort({
            userId,
            phase: 'post_attempt',
            timetableId,
            classDate,
            method,
            outcome: 'failed',
            reason: errMessage,
            jobId: jobIdString(job.id),
          });
          throw err;
        }

        // WHY: 外部HTML由来のメッセージはサニタイズしてからDB保存
        const sanitizedMessage = result.message ? sanitizeExternalText(result.message) : undefined;

        // WHY: 送信後監査ログ。outcome=success/failed と sanitized message を残す
        await recordAuditBestEffort({
          userId,
          phase: 'post_attempt',
          timetableId,
          classDate,
          method,
          outcome: result.success ? 'success' : 'failed',
          reason: result.success ? null : (sanitizedMessage ?? null),
          jobId: jobIdString(job.id),
          metadata: sanitizedMessage ? { sanitizedMessage } : null,
        });

        // WHY: success / 復帰系では errorDetail を null clear する。Prisma は
        // undefined を「更新しない」として扱うため、明示的に null を渡さないと
        // 過去 failed の errorDetail がリトライ成功後も残ってしまう。
        await saveLog(
          userId,
          timetableId,
          result.success ? 'success' : 'failed',
          method,
          result.success ? null : (sanitizedMessage ?? null),
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

/**
 * method 別の guard 評価結果。reject 理由と stage を返す。
 *
 * WHY: auto と confirm で guard 条件が違うため、processAttendanceJob 内で
 * 大きな if-else が散らかる。method 分岐をこの関数に閉じ込めて、
 * 呼び出し側は「reject ならスキップ処理」のみに集中する。
 */
type GuardRejection = {
  reason: string;
  stage: 'pre_network' | 'post_network' | 'unsupported_method';
  metadata?: Record<string, unknown>;
};

interface MethodGuardInput {
  method: AttendanceMode;
  userId: string;
  timetableId: string;
  roomId: string;
  classDate: Date;
  now: Date;
  timetable: {
    userId: string;
    dayOfWeek: number;
    period: number;
    room: string | null;
    user: {
      // WHY: Prisma Bytes は Uint8Array として型付けされる。Buffer は Uint8Array の
      // サブクラスなので、汎用に Uint8Array で受ける
      encryptedCitCreds: Uint8Array | null;
      attendanceSettings: unknown;
    };
  };
  existingSuccess: unknown;
  adapter: AttendanceAdapter;
}

async function evaluateMethodGuard(
  input: MethodGuardInput
): Promise<GuardRejection | null> {
  if (input.method === 'auto') {
    return evaluateAutoMethodGuard(input);
  }
  if (input.method === 'confirm') {
    return evaluateConfirmMethodGuard(input);
  }
  // manual は Worker で処理しない (UI 側で完結)。不明 method も同様
  return {
    reason: `unsupported method=${input.method}`,
    stage: 'unsupported_method',
  };
}

async function evaluateAutoMethodGuard(
  input: MethodGuardInput
): Promise<GuardRejection | null> {
  // pre-network: DB / 内部状態だけで判定。reject 時は adapter に触れない
  const guardInput: AttendanceAutoGuardPreNetworkInput = {
    // WHY: server 側の明示的キルスイッチ。QR セッション検証 DB が入るまで
    // true にしても qrSessionValid=false により自動送信は解禁されない。
    autoExecutionEnabled: process.env.ATTENDANCE_AUTO_EXECUTION_ENABLED === 'true',
    method: input.method,
    storedMode: normalizeAttendanceSettings(input.timetable.user.attendanceSettings).mode,
    timetableUserId: input.timetable.userId,
    jobUserId: input.userId,
    timetableRoom: input.timetable.room,
    jobRoomId: input.roomId,
    dayOfWeek: input.timetable.dayOfWeek,
    period: input.timetable.period,
    now: input.now,
    alreadySubmitted: !!input.existingSuccess,
    qrSessionValid: false,
  };

  const pre = evaluateAttendanceAutoGuardPreNetwork(guardInput);
  if (!pre.allowed) return { reason: pre.reason, stage: 'pre_network' };

  // healthCheck で初めて外部アクセス。注: フェーズ 0 では preGuard が常に
  // reject するため、この行に到達することはない。
  const healthy = await input.adapter.healthCheck();

  const full = evaluateAttendanceAutoGuard({ ...guardInput, campusReachable: healthy });
  if (!full.allowed) {
    return {
      reason: full.reason,
      stage: 'post_network',
      metadata: { campusReachable: healthy, stage: 'post_network' },
    };
  }
  return null;
}

async function evaluateConfirmMethodGuard(
  input: MethodGuardInput
): Promise<GuardRejection | null> {
  // confirm の pre-network 相当: timetable 所有 / room 一致 / 時刻 / 重複 / creds
  // WHY: フロント検証バイパス (curl 直 POST) でも room mismatch 等を確実に拒否
  const guardInput: ConfirmSubmitGuardInput = {
    jobUserId: input.userId,
    jobTimetableId: input.timetableId,
    jobRoomId: input.roomId,
    jobClassDate: input.classDate,
    timetableUserId: input.timetable.userId,
    timetableRoom: input.timetable.room,
    timetableDayOfWeek: input.timetable.dayOfWeek,
    timetablePeriod: input.timetable.period,
    alreadySubmittedConfirm: !!input.existingSuccess,
    hasCitCreds: !!input.timetable.user.encryptedCitCreds,
    now: input.now,
  };

  const confirmGuard = evaluateConfirmSubmitGuard(guardInput);
  if (!confirmGuard.allowed) {
    return { reason: confirmGuard.reason, stage: 'pre_network' };
  }

  // 全 pre-network が通ってから healthCheck (外部アクセス)
  const healthy = await input.adapter.healthCheck();
  if (!healthy) {
    return {
      reason: 'attendance system is not reachable from campus network',
      stage: 'post_network',
      metadata: { campusReachable: false, stage: 'post_network' },
    };
  }
  return null;
}

/**
 * BullMQ Job ID を文字列に正規化する (string | number | undefined → string | null)。
 *
 * WHY: AttendanceAuditLog の jobId は string | null 想定だが、BullMQ の Job.id は
 * Job のオプションによって number になる場合もある。監査ログでは検索用に
 * string で一貫させる。
 */
function jobIdString(id: string | number | undefined): string | null {
  if (id === undefined) return null;
  return String(id);
}

/**
 * 監査ログを書き込む (必須記録)。書き込み失敗時は例外を投げる。
 *
 * WHY: pre_attempt は「外部システムへ実 HTTP を出す直前」の記録なので、
 * これに失敗したまま adapter.attend() に進ませると「監査ログが残らない送信」が
 * 発生し、出席 auto 解禁条件 4「送信前・送信後・skip/block 理由を残せる」を
 * 満たさなくなる。監査 DB 障害時は外部送信もスキップする (BullMQ がジョブを
 * 失敗扱いにし、リトライで監査込みの再実行を期待する) のが安全側の挙動。
 *
 * post_attempt 用には `recordAuditBestEffort` を使うこと (送信後は副作用を
 * 取り消せないため失敗時に throw しても無意味)。
 */
export async function recordAuditRequired(input: AttendanceAuditLogInput): Promise<void> {
  const data = toAttendanceAuditLogCreateData(input);
  // WHY: Prisma の Json? カラムは TypeScript レベルで `null` の直接代入を
  // 許さず、明示的な NULL 書き込みには Prisma.JsonNull が必要。また
  // Record<string, unknown> も InputJsonValue として直接受け付けないため
  // ここでキャストする。shared 側は Prisma 非依存を維持するため、最終変換は
  // worker 側で行う。
  const metadata: Prisma.InputJsonValue | typeof Prisma.JsonNull = data.metadata
    ? (data.metadata as Prisma.InputJsonValue)
    : Prisma.JsonNull;

  await prisma.attendanceAuditLog.create({
    data: {
      ...data,
      metadata,
    },
  });
}

/**
 * 監査ログを書き込む (best-effort)。書き込み失敗時は console.error のみで処理を続行する。
 *
 * WHY: 以下のケースで使う:
 *   - post_attempt: adapter.attend() の戻り値/例外を受けて呼ばれる。外部送信は
 *     既に走っているので、ここで throw しても副作用は取り消せない。記録漏れは
 *     ログのみで通知し、本ジョブは続行する。
 *   - skipped / blocked: 外部送信を伴わないため、記録漏れがあっても二次被害なし。
 *     監査用途でログには残すが、最重要は AttendanceLog 側の記録。
 *
 * pre_attempt には使わないこと (recordAuditRequired を使う)。
 */
async function recordAuditBestEffort(input: AttendanceAuditLogInput): Promise<void> {
  try {
    await recordAuditRequired(input);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    console.error(
      `[attendance:audit] failed to record audit log (phase=${input.phase}): ${message}`
    );
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

/**
 * AttendanceLog を upsert する。
 *
 * WHY: errorDetail を `string | null` で受け取り、未指定 (= null) なら明示的に
 * null clear する。Prisma は `data: { errorDetail: undefined }` を「更新しない」
 * として扱うため、success / skipped の path で undefined を渡すと過去の
 * failed errorDetail が残り続ける。これを防ぐため呼び出し側もこの関数も
 * null を明示する。
 */
async function saveLog(
  userId: string,
  timetableId: string,
  status: string,
  method: AttendanceMode,
  errorDetail: string | null = null,
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
