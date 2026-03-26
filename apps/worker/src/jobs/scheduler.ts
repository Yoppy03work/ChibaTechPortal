/**
 * スケジューラ
 *
 * WHY: スクレイピング（15分間隔）と出席（授業5分前）の2種類のジョブを管理する。
 * ジッター（±3分）で同一秒にリクエストが集中しないようにする。
 * 稼働時間は7:00〜22:00（設計書に基づく）。
 */
import { prisma } from '@chibatech/db';
import { scrapeQueue } from './scrape-job';
import { attendanceQueue } from './attendance-job';

const SCRAPE_INTERVAL_MS = 15 * 60 * 1000; // 15分
const ATTENDANCE_CHECK_INTERVAL_MS = 60 * 1000; // 1分（授業時間チェック）
const JITTER_MAX_MS = 3 * 60 * 1000; // ±3分
const ACTIVE_HOURS = { start: 7, end: 22 };
const ATTENDANCE_LEAD_MINUTES = 5; // 授業開始5分前に出席

/** 授業時限の開始時刻（時:分） */
const PERIOD_START_TIMES: Record<number, { hour: number; minute: number }> = {
  1: { hour: 9, minute: 30 },
  2: { hour: 11, minute: 10 },
  3: { hour: 13, minute: 10 },
  4: { hour: 14, minute: 50 },
  5: { hour: 16, minute: 30 },
  6: { hour: 18, minute: 10 },
};

function isActiveHour(): boolean {
  const hour = new Date().getHours();
  return hour >= ACTIVE_HOURS.start && hour < ACTIVE_HOURS.end;
}

function randomJitter(): number {
  return Math.floor(Math.random() * JITTER_MAX_MS * 2) - JITTER_MAX_MS;
}

/**
 * 全ユーザーに対してスクレイピングジョブを投入する
 */
async function enqueueScrapeJobs() {
  if (!isActiveHour()) return;

  const users = await prisma.user.findMany({
    where: {
      OR: [
        { encryptedCitCreds: { not: null } },
        { encryptedManabaCreds: { not: null } },
      ],
    },
    select: {
      id: true,
      encryptedCitCreds: true,
      encryptedManabaCreds: true,
    },
  });

  for (const user of users) {
    const delay = Math.max(0, randomJitter() + JITTER_MAX_MS);

    if (user.encryptedCitCreds) {
      await scrapeQueue.add('cit-portal', {
        userId: user.id,
        target: 'cit-portal' as const,
        encryptedCreds: user.encryptedCitCreds,
      }, { delay });
    }

    if (user.encryptedManabaCreds) {
      await scrapeQueue.add('manaba', {
        userId: user.id,
        target: 'manaba' as const,
        encryptedCreds: user.encryptedManabaCreds,
      }, { delay: delay + 1000 });
    }
  }

  console.log(`[scheduler] Enqueued scrape jobs for ${users.length} users`);
}

/**
 * 出席ジョブを投入する（授業開始5分前の時限を対象）
 *
 * WHY: 1分間隔でチェックし、現在時刻が「授業開始5分前」に該当する時限があれば
 * その時限の授業を持つユーザーの出席ジョブを投入する。
 */
async function enqueueAttendanceJobs() {
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0=日, 1=月, ..., 6=土
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  // 各時限をチェック: 授業開始5分前かどうか
  for (const [periodStr, startTime] of Object.entries(PERIOD_START_TIMES)) {
    const period = parseInt(periodStr, 10);
    const targetMinutes = startTime.hour * 60 + startTime.minute - ATTENDANCE_LEAD_MINUTES;

    if (currentMinutes !== targetMinutes) continue;

    // この時限に授業がある全ユーザーを取得
    const timetables = await prisma.timetable.findMany({
      where: {
        dayOfWeek,
        period,
        room: { not: null },
      },
      select: {
        id: true,
        userId: true,
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

    for (const tt of timetables) {
      // WHY: 自動出席がOFFのユーザーはスキップ
      const settings = tt.user.attendanceSettings as { autoAttend?: boolean } | null;
      if (settings && settings.autoAttend === false) continue;

      // WHY: 認証情報がないユーザーはスキップ
      if (!tt.user.encryptedCitCreds) continue;

      // WHY: roomがnullの場合はスキップ（QR URLを構築できない）
      if (!tt.room) continue;

      await attendanceQueue.add('attend', {
        userId: tt.userId,
        timetableId: tt.id,
        roomId: tt.room,
        className: tt.className,
        encryptedCreds: tt.user.encryptedCitCreds,
      });

      console.log(`[scheduler] Attendance job: ${tt.className} (room ${tt.room}) for user ${tt.userId}`);
    }
  }
}

export function startScheduler() {
  // スクレイピング: 起動時に即実行 + 15分間隔
  enqueueScrapeJobs().catch((err) => {
    console.error('[scheduler] Initial scrape enqueue failed:', err.message);
  });
  const scrapeInterval = setInterval(() => {
    enqueueScrapeJobs().catch((err) => {
      console.error('[scheduler] Scrape enqueue failed:', err.message);
    });
  }, SCRAPE_INTERVAL_MS);

  // 出席: 1分間隔で授業時間チェック
  const attendanceInterval = setInterval(() => {
    enqueueAttendanceJobs().catch((err) => {
      console.error('[scheduler] Attendance enqueue failed:', err.message);
    });
  }, ATTENDANCE_CHECK_INTERVAL_MS);

  return { scrapeInterval, attendanceInterval };
}
