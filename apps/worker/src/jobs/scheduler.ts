/**
 * スケジューラ
 *
 * WHY: スクレイピング（15分間隔）と出席（授業5分前）の2種類のジョブを管理する。
 * ジッター（±3分）で同一秒にリクエストが集中しないようにする。
 * 稼働時間は7:00〜22:00（設計書に基づく）。
 */
import { prisma } from '@chibatech/db';
import {
  normalizeAttendanceSettings,
  PERIOD_START_TIMES,
  ATTENDANCE_LEAD_MINUTES,
  getJstParts,
} from '@chibatech/shared';
import { scrapeQueue } from './scrape-job';
import { attendanceQueue } from './attendance-job';
import { notifyQueue } from './notify-job';

const SCRAPE_INTERVAL_MS = 15 * 60 * 1000; // 15分
const ATTENDANCE_CHECK_INTERVAL_MS = 60 * 1000; // 1分（授業時間チェック）
const JITTER_MAX_MS = 3 * 60 * 1000; // ±3分
const ACTIVE_HOURS = { start: 7, end: 22 };
// WHY: confirm モードは授業開始の何分前にリマインダ push を送るか。
// ユーザが UI を開いて出席ウィンドウ (開始 5 分前 ±2 分) に間に合うよう、
// attend lead (5 分) より大きめにする。
const REMINDER_LEAD_MINUTES = 10;

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
export async function enqueueScrapeJobs() {
  // WHY: スクレイピングは SCRAPE_ENABLED=true のときのみ実行する。既定（未設定/false）は
  // 外部アクセスしない。startScheduler でも gate するが、stray な呼び出しを防ぐ
  // 多層防御としてここでも弾く（ATTENDANCE_AUTO_EXECUTION_ENABLED と同じ思想）。
  if (process.env.SCRAPE_ENABLED !== 'true') return;
  if (!isActiveHour()) return;

  // WHY: キューにはuserIdと対象種別のみ載せる。認証情報はworker側でDB取得・復号する
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
      }, { delay });
    }

    if (user.encryptedManabaCreds) {
      await scrapeQueue.add('manaba', {
        userId: user.id,
        target: 'manaba' as const,
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
      // WHY: フェーズ0段階では Scheduler から自動送信は行わない。
      // confirm/manual はそもそも対象外。auto は 6条件チェック + 監査ログが
      // 実装される PR4 で解禁する（memory: feedback_attendance_auto_guard.md）。
      // それまではユーザー設定が auto でもジョブ投入をブロックする安全装置として機能する。
      const { mode } = normalizeAttendanceSettings(tt.user.attendanceSettings);
      if (mode !== 'auto') continue;

      // TODO(PR4): 6条件チェックを通過したときだけ下記を実行する
      //   if (!tt.user.encryptedCitCreds) continue;
      //   if (!tt.room) continue;
      //   await attendanceQueue.add('attend', {
      //     userId: tt.userId, timetableId: tt.id, roomId: tt.room,
      //     className: tt.className, method: mode,
      //   });
      console.log(
        `[scheduler] auto mode is locked until PR4. skip user=${tt.userId} class=${tt.className}`
      );
    }
  }
}

/**
 * confirm モードのリマインダ push を投入する（授業開始 REMINDER_LEAD_MINUTES 分前）。
 *
 * WHY: confirm は「ユーザが UI を開いて確認 → 送信」する手動操作で、出席ウィンドウ
 * (開始 5 分前 ±2 分) は狭い。その手前で push して「アプリを開いて出席確認」を促す。
 * CONFIRM_REMINDER_ENABLED=true のときのみ動作する（既定オフ）。時刻判定は JST
 * (getJstParts) で行いコンテナ TZ に依存しない。
 */
export async function enqueueConfirmReminders() {
  if (process.env.CONFIRM_REMINDER_ENABLED !== 'true') return;

  const jst = getJstParts(new Date());
  const currentMinutes = jst.hour * 60 + jst.minute;
  const ymd = `${jst.year}-${String(jst.month).padStart(2, '0')}-${String(
    jst.day
  ).padStart(2, '0')}`;

  for (const [periodStr, startTime] of Object.entries(PERIOD_START_TIMES)) {
    const period = parseInt(periodStr, 10);
    const reminderMinutes =
      startTime.hour * 60 + startTime.minute - REMINDER_LEAD_MINUTES;
    if (currentMinutes !== reminderMinutes) continue;

    const timetables = await prisma.timetable.findMany({
      where: { dayOfWeek: jst.dayOfWeek, period, room: { not: null } },
      select: {
        id: true,
        userId: true,
        className: true,
        user: { select: { attendanceSettings: true } },
      },
    });

    for (const tt of timetables) {
      const { mode } = normalizeAttendanceSettings(tt.user.attendanceSettings);
      if (mode !== 'confirm') continue;

      // WHY: 1 分 tick の重複や worker 再起動での二重送信を防ぐため、jobId を
      // user+timetable+日付で一意化する。source:'attendance' は notify 側で source
      // フィルタ対象外として扱われ、quiet hours は notify 側で考慮される。
      await notifyQueue.add(
        'notify',
        {
          userId: tt.userId,
          notifications: [
            {
              title: `${tt.className} の出席確認: アプリを開いて出席を送信してください`,
              source: 'attendance',
            },
          ],
        },
        {
          jobId: `reminder-${tt.userId}-${tt.id}-${ymd}`,
          removeOnComplete: 100,
          removeOnFail: true,
        }
      );
    }
  }
}

export function startScheduler() {
  // WHY: スクレイピングは SCRAPE_ENABLED=true のときだけ起動する。既定では起動時の
  // 即実行も 15 分間隔も行わない（外部アクセスしない dark default）。テスト/ドライランで
  // 意図しない CIT Portal / manaba アクセスを防ぐ。
  const scrapeEnabled = process.env.SCRAPE_ENABLED === 'true';
  let scrapeInterval: ReturnType<typeof setInterval> | undefined;
  if (scrapeEnabled) {
    // スクレイピング: 起動時に即実行 + 15分間隔
    enqueueScrapeJobs().catch((err) => {
      console.error('[scheduler] Initial scrape enqueue failed:', err.message);
    });
    scrapeInterval = setInterval(() => {
      enqueueScrapeJobs().catch((err) => {
        console.error('[scheduler] Scrape enqueue failed:', err.message);
      });
    }, SCRAPE_INTERVAL_MS);
  } else {
    console.log('[scheduler] scrape disabled (SCRAPE_ENABLED!=true)');
  }

  // 出席: 1分間隔で授業時間チェック + confirm リマインダ
  const attendanceInterval = setInterval(() => {
    enqueueAttendanceJobs().catch((err) => {
      console.error('[scheduler] Attendance enqueue failed:', err.message);
    });
    enqueueConfirmReminders().catch((err) => {
      console.error('[scheduler] Confirm reminder enqueue failed:', err.message);
    });
  }, ATTENDANCE_CHECK_INTERVAL_MS);

  return { scrapeInterval, attendanceInterval };
}
