/**
 * Worker サービス エントリーポイント
 *
 * WHY: Next.js（Webサーバー）とは別プロセスで稼働し、
 * スクレイピング・通知送信・出席処理をBullMQジョブとして実行する。
 */
import { startScrapeWorker } from './jobs/scrape-job';
import { startNotifyWorker } from './jobs/notify-job';
import { startAttendanceWorker } from './jobs/attendance-job';
import { startScheduler } from './jobs/scheduler';

console.log('ChibaTechPortal Worker starting...');

const scrapeWorker = startScrapeWorker();
const notifyWorker = startNotifyWorker();
const attendanceWorker = startAttendanceWorker();
const scheduler = startScheduler();

console.log('Workers started: scrape, notify, attendance');
console.log(
  'Scheduler started: attendance 1min check, active 7:00-22:00 (scrape gated by SCRAPE_ENABLED)'
);

// Graceful shutdown
async function shutdown() {
  console.log('Shutting down workers...');
  clearInterval(scheduler.scrapeInterval);
  clearInterval(scheduler.attendanceInterval);
  // WHY: CIT SSO 同期インターバルも停止する (未クリアだと shutdown 後も発火し得る)。
  // 無効時は undefined だが clearInterval(undefined) は no-op で安全。
  clearInterval(scheduler.citTimetableSyncInterval);
  clearInterval(scheduler.citNotificationsSyncInterval);
  clearInterval(scheduler.citSyllabusSyncInterval);
  await scrapeWorker.close();
  await notifyWorker.close();
  await attendanceWorker.close();
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
