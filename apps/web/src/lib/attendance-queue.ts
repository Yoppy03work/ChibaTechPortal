/**
 * 出席ジョブのキュー (Producer 側 / Web プロセス)
 *
 * WHY: confirm 送信 API (`POST /api/attendance/submit`) から BullMQ に
 * ジョブを add するだけのために用意する。実際の実行は apps/worker の
 * attendance-job ワーカーが拾う。
 *
 * - Queue 名は shared で一元管理 (ATTENDANCE_QUEUE_NAME)
 * - Redis 接続は web 共有の `redis` を再利用する (別接続を張らない)。
 *   共有 redis は maxRetriesPerRequest:null + lazyConnect 済みで BullMQ 要件を満たす。
 */
import { Queue, type ConnectionOptions } from 'bullmq';
import { ATTENDANCE_QUEUE_NAME } from '@chibatech/shared';
import { redis } from './redis';

// WHY: ioredis インスタンスは BullMQ の ConnectionOptions として渡せる。
const bullmqConnection = redis as unknown as ConnectionOptions;

export const attendanceQueue = new Queue(ATTENDANCE_QUEUE_NAME, {
  connection: bullmqConnection,
});
