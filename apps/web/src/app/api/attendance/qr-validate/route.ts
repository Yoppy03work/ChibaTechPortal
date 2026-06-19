/**
 * 出席 QR セッション検証 API
 *
 * POST /api/attendance/qr-validate
 *
 * WHY: auto 出席解禁の前提となる「QR 由来の検証済みセッション」を作る。ユーザが教室の
 * QR をスキャンして在席を示すと、ownership / room / classDate / 時刻ウィンドウ を confirm と
 * 同じ guard で検証し、通れば AttendanceQrSession を upsert する。Worker の auto guard が
 * このセッション（期限内 + roomId 一致 + 本人）で qrSessionValid を判定する材料にする。
 *
 * 本ハンドラは外部システムへ実 HTTP を出さない（DB upsert のみ）。mode は不問
 * （セッションは「在席の証明」であり、auto/confirm の判定は別途 mode で行う）。
 */
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@chibatech/db';
import {
  confirmSubmitInputSchema,
  evaluateConfirmSubmitGuard,
  RATE_LIMITS,
} from '@chibatech/shared';
import { validateStateChangingRequest } from '@/lib/api-guard';
import { rateLimiter } from '@/lib/rate-limiter';

export const dynamic = 'force-dynamic';

// WHY: スキャンから auto 送信（授業開始前後）までをカバーする短命 TTL。
const QR_SESSION_TTL_MS = 30 * 60 * 1000;

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

  // 2.5 レートリミット（認証済みユーザ単位）
  const rateResult = await rateLimiter.check(
    `attend-qr:${userId}`,
    RATE_LIMITS.attendanceQrValidate
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

  // 3. body の zod 検証（confirm submit と同形なので schema を再利用）
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

  // 4. timetable 取得（DB のみ）
  const timetable = await prisma.timetable.findUnique({
    where: { id: timetableId },
    select: { id: true, userId: true, dayOfWeek: true, period: true, room: true },
  });
  if (!timetable) {
    return NextResponse.json({ error: 'Invalid timetable' }, { status: 400 });
  }

  // 5. ownership / room / classDate / 時刻ウィンドウ を confirm と同じ guard で検証する。
  // WHY: セッション作成では重複・creds は不問なので、それらは pass 値を渡して外し、
  // ownership/room/date/window だけを enforce する（guard ロジックを再利用し DRY に）。
  const guardResult = evaluateConfirmSubmitGuard({
    jobUserId: userId,
    jobTimetableId: timetableId,
    jobRoomId: roomId,
    jobClassDateYmd: classDate,
    timetableUserId: timetable.userId,
    timetableRoom: timetable.room,
    timetableDayOfWeek: timetable.dayOfWeek,
    timetablePeriod: timetable.period,
    alreadySubmittedConfirm: false,
    hasCitCreds: true,
    now: new Date(),
  });
  if (!guardResult.allowed) {
    return NextResponse.json(
      { error: 'qr_validate_blocked', reason: guardResult.reason },
      { status: 400 }
    );
  }

  // 6. セッションを upsert（再スキャンは更新）。
  // WHY: classDate は @db.Date。`new Date('YYYY-MM-DD')` は UTC midnight になり、
  // @db.Date はその UTC 日付 (= 入力の YYYY-MM-DD) を保存する。Worker 読み取りも
  // 同じ規約で classDate を構築して一致させる。
  const classDateObj = new Date(classDate);
  const expiresAt = new Date(Date.now() + QR_SESSION_TTL_MS);

  await prisma.attendanceQrSession.upsert({
    where: {
      userId_roomId_classDate: { userId, roomId, classDate: classDateObj },
    },
    create: { userId, roomId, timetableId, classDate: classDateObj, expiresAt },
    update: { timetableId, expiresAt, consumedAt: null },
  });

  return NextResponse.json({ validated: true, expiresAt }, { status: 200 });
}
