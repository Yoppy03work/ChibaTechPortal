/**
 * 手動出席記録 API
 *
 * POST /api/attendance/manual  body: { timetableId }
 *
 * WHY: QRが使えない場面のフォールバックとして「自分が出席した」ことをアプリ内に
 * 記録する（method='manual'）。外部システムへの送信は一切行わない — 自分のDBに
 * AttendanceLog を1行書くだけ。対象は本人所有かつ「今日(JST)の曜日」の授業に限定し、
 * classDate は既存規約（JSTのYYYY-MM-DDをUTC midnightで保存）に従う。
 * 二重記録は @@unique([userId,timetableId,classDate,method]) で冪等に吸収する。
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { prisma } from '@chibatech/db';
import { RATE_LIMITS, formatJstYmd, getJstParts } from '@chibatech/shared';
import { validateStateChangingRequest } from '@/lib/api-guard';
import { rateLimiter } from '@/lib/rate-limiter';

export const dynamic = 'force-dynamic';

const manualInputSchema = z.object({
  timetableId: z.string().uuid(),
});

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

  // 3. レートリミット（confirm submit と同じ強度）
  const rateResult = await rateLimiter.check(
    `attend-manual:${userId}`,
    RATE_LIMITS.attendanceSubmit
  );
  if (!rateResult.allowed) {
    return NextResponse.json(
      { error: 'Too many requests' },
      {
        status: 429,
        headers: {
          'Retry-After': String(Math.ceil((rateResult.resetAt.getTime() - Date.now()) / 1000)),
        },
      }
    );
  }

  // 4. 入力検証
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const parsed = manualInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed' }, { status: 400 });
  }

  // 5. 所有チェック + 「今日の授業」チェック
  const timetable = await prisma.timetable.findFirst({
    where: { id: parsed.data.timetableId, userId },
  });
  if (!timetable) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const now = new Date();
  if (timetable.dayOfWeek !== getJstParts(now).dayOfWeek) {
    return NextResponse.json({ error: 'Not today\'s class' }, { status: 400 });
  }

  // 6. 記録（unique 制約で二重登録を冪等に吸収）
  const classDate = new Date(formatJstYmd(now));
  try {
    await prisma.attendanceLog.create({
      data: {
        userId,
        timetableId: timetable.id,
        classDate,
        status: 'success',
        method: 'manual',
      },
    });
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    // P2002 = unique violation（既に記録済み）
    if (typeof e === 'object' && e !== null && 'code' in e && (e as { code?: string }).code === 'P2002') {
      return NextResponse.json({ ok: true, already: true });
    }
    throw e;
  }
}
