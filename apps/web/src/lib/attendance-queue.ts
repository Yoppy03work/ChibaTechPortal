/**
 * 出席ジョブのキュー (Producer 側 / Web プロセス)
 *
 * WHY: confirm 送信 API (`POST /api/attendance/submit`) から BullMQ に
 * ジョブを add するだけのために用意する。実際の実行は apps/worker の
 * attendance-job ワーカーが拾う。
 *
 * - Queue 名は shared で一元管理 (ATTENDANCE_QUEUE_NAME)
 * - Redis 接続は ioredis を Web プロセスで生成
 * - Worker と同じ Redis に接続する必要があるため、REDIS_URL を共有する
 */
import { Queue, type ConnectionOptions } from 'bullmq';
import IORedis from 'ioredis';
import { ATTENDANCE_QUEUE_NAME } from '@chibatech/shared';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

// WHY: maxRetriesPerRequest: null は BullMQ の要件 (Worker と同じ)
const redis = new IORedis(REDIS_URL, {
  maxRetriesPerRequest: null,
});

const bullmqConnection = redis as unknown as ConnectionOptions;

export const attendanceQueue = new Queue(ATTENDANCE_QUEUE_NAME, {
  connection: bullmqConnection,
});
