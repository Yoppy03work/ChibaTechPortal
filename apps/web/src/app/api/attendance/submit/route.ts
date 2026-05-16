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
} from '@chibatech/shared';
import { validateStateChangingRequest } from '@/lib/api-guard';
import { attendanceQueue } from '@/lib/attendance-queue';

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
        user: { select: { encryptedCitCreds: true } },
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

  // 5. confirm-guard (サーバー側検証)
  // WHY: フロントの ConfirmFlow と Worker 入口、本ハンドラの 3 箇所で同じ判定を
  // 通すことで、どこか 1 つを通り抜けても他で reject される設計
  const guardResult = evaluateConfirmSubmitGuard({
    jobUserId: userId,
    jobTimetableId: timetableId,
    jobRoomId: roomId,
    jobClassDate: toClassDate(classDateObj),
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

  // 6. BullMQ にジョブを enqueue (外部 HTTP は worker が実行)
  // WHY: jobId を timetableId + classDate + method の組み合わせで一意化することで、
  // 同一クラスへの二重 enqueue を BullMQ 側でも軽く防ぐ (DB 重複防止と二重防衛)
  const jobId = `confirm:${userId}:${timetableId}:${toClassDate(classDateObj).toISOString().slice(0, 10)}`;

  await attendanceQueue.add(
    ATTENDANCE_JOB_NAME,
    {
      userId,
      timetableId,
      roomId,
      className: '', // worker 側で timetable から取得するので空でも可
      method: CONFIRM_METHOD,
    },
    {
      jobId,
      removeOnComplete: 100,
      removeOnFail: 100,
    }
  );

  return NextResponse.json({ accepted: true, jobId }, { status: 202 });
}

function toClassDate(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}
