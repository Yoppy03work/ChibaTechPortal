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
console.log('Scheduler started: scrape 15min, attendance 1min check, active 7:00-22:00');

// Graceful shutdown
async function shutdown() {
  console.log('Shutting down workers...');
  clearInterval(scheduler.scrapeInterval);
  clearInterval(scheduler.attendanceInterval);
  await scrapeWorker.close();
  await notifyWorker.close();
  await attendanceWorker.close();
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
