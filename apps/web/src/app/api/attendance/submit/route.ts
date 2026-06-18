/**
 * 出席 confirm 送信 API
 *
 * POST /api/attendance/submit
 *
 * WHY: confirm モードで「ユーザーが UI で意図を確認して送信」する経路。
 * フロント検証バイパス (curl 直 POST 等) に耐えるため、サーバー側で
 * `evaluateConfirmSubmitGuard()` を通して同じ判定を再実行する。通過した時のみ
 * BullMQ に method='confirm' のジョブを add する。実送信 (adapter.attend) は
 * Worker 側で別途実行され、結果は Push 通知で返る。
 *
 * 本ハンドラは外部システムへ実 HTTP は出さない (BullMQ への enqueue のみ)。
 */
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@chibatech/db';
import {
  confirmSubmitInputSchema,
  evaluateConfirmSubmitGuard,
  ATTENDANCE_JOB_NAME,
  CONFIRM_METHOD,
  RATE_LIMITS,
  normalizeAttendanceSettings,
} from '@chibatech/shared';
import { validateStateChangingRequest } from '@/lib/api-guard';
import { attendanceQueue } from '@/lib/attendance-queue';
import { rateLimiter } from '@/lib/rate-limiter';

// WHY: 認証情報・出席記録に関わるため Next.js キャッシュを無効化
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  // 1. CSRF / Origin / Content-Type ガード
  const guardResp = validateStateChangingRequest(request, { requireJson: true });
  if (guardResp) return guardResp;

  // 2. 認証
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = session.user.id;

  // 2.5 レートリミット (認証済みユーザ単位)
  // WHY: 認証済みでも /api/attendance/submit を連打すると BullMQ enqueue + DB read が
  // 圧迫される。jobId 衝突で実行 attend は一意に収束するが、ハンドラ自体の負荷は
  // 残るのでここで弾く。
  const rateResult = await rateLimiter.check(
    `attend-submit:${userId}`,
    RATE_LIMITS.attendanceSubmit
  );
  if (!rateResult.allowed) {
    return NextResponse.json(
      { error: 'Too many requests' },
      {
        status: 429,
        headers: {
          'Retry-After': String(
            Math.ceil((rateResult.resetAt.getTime() - Date.now()) / 1000)
          ),
        },
      }
    );
  }

  // 3. body の Zod 検証 (untrusted 入力)
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const parsed = confirmSubmitInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed' }, { status: 400 });
  }
  const { timetableId, roomId, classDate } = parsed.data;
  const classDateObj = new Date(classDate);

  // 4. timetable と重複ログを DB 取得 (外部アクセスなし)
  const [timetable, existingSuccess] = await Promise.all([
    prisma.timetable.findUnique({
      where: { id: timetableId },
      select: {
        id: true,
        userId: true,
        dayOfWeek: true,
        period: true,
        room: true,
        // WHY: queue payload に詰めて Worker 入口の zod (className.min(1)) を
        // 通すために必要。Worker は内部で再度 DB から取得するが、payload を
        // 空にすると schema 違反で全 confirm ジョブが parse 段階で死ぬ。
        className: true,
        // WHY: フロントの ConfirmFlow は mode≠confirm では hide されるだけ。
        // 直接 POST (curl 等) で auto/manual ユーザの confirm 経路を起動させない
        // ため、サーバ側で attendanceSettings.mode を確認する。
        user: {
          select: { encryptedCitCreds: true, attendanceSettings: true },
        },
      },
    }),
    prisma.attendanceLog.findFirst({
      where: {
        userId,
        timetableId,
        // WHY: classDate は @db.Date のため、time 部分を 0:00 に揃えて比較
        classDate: toClassDate(classDateObj),
        status: 'success',
      },
      select: { id: true },
    }),
  ]);

  if (!timetable) {
    // WHY: 存在しない timetableId への問い合わせは情報を返さず汎用 400 で返す
    return NextResponse.json({ error: 'Invalid timetable' }, { status: 400 });
  }

  // 5. confirm-guard (サーバー側検証) — ownership/room/date/time/duplicate/creds
  // WHY: フロントの ConfirmFlow と Worker 入口、本ハンドラの 3 箇所で同じ判定を
  // 通すことで、どこか 1 つを通り抜けても他で reject される設計。
  // ownership (timetable_not_owned) はここで最初に reject される。
  const guardResult = evaluateConfirmSubmitGuard({
    jobUserId: userId,
    jobTimetableId: timetableId,
    jobRoomId: roomId,
    // WHY: zod 検証済みの JST カレンダー日 (`YYYY-MM-DD`) をそのまま渡す。
    // toClassDate(new Date(...)) 経由だと host TZ で setHours truncate され、
    // 負オフセットのホストで JST 日とズレて class_date_mismatch を誤判定する。
    jobClassDateYmd: parsed.data.classDate,
    timetableUserId: timetable.userId,
    timetableRoom: timetable.room,
    timetableDayOfWeek: timetable.dayOfWeek,
    timetablePeriod: timetable.period,
    alreadySubmittedConfirm: !!existingSuccess,
    hasCitCreds: !!timetable.user.encryptedCitCreds,
    now: new Date(),
  });

  if (!guardResult.allowed) {
    // WHY: reason はコード文字列のみ。UI で日本語に翻訳する想定で、API は
    // 機械可読の固定コードを返す。raw 入力は含めない
    return NextResponse.json(
      { error: 'submit_blocked', reason: guardResult.reason },
      { status: 400 }
    );
  }

  // 5.5 attendance mode のサーバ側検証 (ownership 確認 *後* に行う)
  // WHY: フロントの ConfirmFlow を hide するだけだと curl 直叩きで auto/manual
  // ユーザの confirm 経路を起動できてしまう。サーバ側で mode='confirm' でない
  // 場合は 400 で拒否する (二重防衛)。
  // WHY (順序): mode-check を guard より前に置くと、他人の timetableId を送った
  // 攻撃者に対し mode によって応答が変わり (`not_in_confirm_mode` vs
  // `timetable_not_owned`)、被害者の mode が漏れる。ownership 失敗を guard で
  // 先に弾いてから mode を見ることで応答を一定にする。
  const storedMode = normalizeAttendanceSettings(
    timetable.user.attendanceSettings
  ).mode;
  if (storedMode !== 'confirm') {
    return NextResponse.json(
      { error: 'submit_blocked', reason: 'not_in_confirm_mode' },
      { status: 400 }
    );
  }

  // 6. BullMQ にジョブを enqueue (外部 HTTP は worker が実行)
  // WHY: jobId を「同一クラス・同日」で一意化することで、同一クラスへの二重
  // enqueue を BullMQ 側でも軽く防ぐ (DB 重複防止と二重防衛)。
  // セパレータは `-` を使う: BullMQ 内部キーは `bull:<queue>:<jobId>` の形で
  // `:` を区切りに使うため、custom jobId に `:` を混ぜると Redis キー解析の
  // 混乱を招く可能性がある (Codex 指摘)。
  // WHY (consistency): jobId は existingSuccess 検索 / 監査ログ書き込みで使う
  // `toClassDate(classDateObj)` と同じ Date を Y-M-D 化する。raw 文字列を
  // slice したり別 TZ で正規化したりすると、同一カレンダー日 (DB 視点) でも
  // jobId が分裂して BullMQ 重複防御をバイパスする (Codex 指摘)。
  const classDateForKey = toClassDate(classDateObj);
  const classDateYmd = formatYmdLocal(classDateForKey);
  const jobId = `confirm-${userId}-${timetableId}-${classDateYmd}`;

  await attendanceQueue.add(
    ATTENDANCE_JOB_NAME,
    {
      userId,
      timetableId,
      roomId,
      // WHY: Worker 入口の zod (className.min(1)) を満たすため timetable 実値を
      // 詰める。Worker は内部で sanitize 用に DB から再取得するが、payload を
      // 空にすると schema parse で reject → ジョブが Worker に到達しない。
      className: timetable.className,
      method: CONFIRM_METHOD,
      // WHY: ユーザが UI で確認した classDate を payload に乗せる。Worker が
      // new Date() で再計算すると、遅延ジョブ実行時に「実行日 ≠ 確認日」となり
      // 別日の出席を送ってしまう (replay protection が機能しない)。
      // ここでは zod 検証済みの raw 文字列をそのまま渡す。`.toISOString().slice(0,10)`
      // 経由だと UTC 変換で前日にズレる (JST 環境で 2026-05-04 → 2026-05-03) ため
      // 文字列を維持し、Worker 側で同じ規約で再 parse する。
      classDate: parsed.data.classDate,
    },
    {
      jobId,
      // WHY: 成功ジョブは履歴として 100 件残す (運用デバッグ用)
      removeOnComplete: 100,
      // WHY: 失敗ジョブを残すと jobId が同一の再試行が「重複」として silently
      // 弾かれ、API は 202 を返すのに Worker が走らない状態になる。
      // append-only な AttendanceAuditLog に失敗履歴は残るため、BullMQ の
      // failed セットは即座に解放してユーザの再試行を可能にする。
      removeOnFail: true,
    }
  );

  return NextResponse.json({ accepted: true, jobId }, { status: 202 });
}

function toClassDate(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

// WHY: toClassDate() の結果 (ローカル TZ 00:00) を `YYYY-MM-DD` に整形する。
// DB query で使う Date と同じ抽出源を使うことで、jobId と
// `existingSuccess`/`attendanceLog.classDate` のキャレンダー日を一致させる。
function formatYmdLocal(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
