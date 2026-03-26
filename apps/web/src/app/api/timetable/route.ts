/**
 * 時間割 API
 *
 * GET: 全時間割取得
 * PUT: 時間割登録/更新（1エントリ）
 * DELETE: 時間割削除
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { prisma } from '@chibatech/db';

// WHY: 個人データを含むため、Next.jsのキャッシュを無効化
export const dynamic = 'force-dynamic';

const timetableEntrySchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  period: z.number().int().min(1).max(6),
  className: z.string().min(1).max(100),
  room: z.string().max(20).optional(),
});

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const entries = await prisma.timetable.findMany({
    where: { userId: session.user.id },
    orderBy: [{ dayOfWeek: 'asc' }, { period: 'asc' }],
  });

  return NextResponse.json({ entries });
}

export async function PUT(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = timetableEntrySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 });
  }

  const { dayOfWeek, period, className, room } = parsed.data;

  // WHY: upsertで同一ユーザー+曜日+時限の重複を防ぐ
  const entry = await prisma.timetable.upsert({
    where: {
      userId_dayOfWeek_period: {
        userId: session.user.id,
        dayOfWeek,
        period,
      },
    },
    update: { className, room },
    create: {
      userId: session.user.id,
      dayOfWeek,
      period,
      className,
      room,
    },
  });

  return NextResponse.json(entry);
}

export async function DELETE(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const dayOfWeek = parseInt(searchParams.get('dayOfWeek') || '', 10);
  const period = parseInt(searchParams.get('period') || '', 10);

  if (isNaN(dayOfWeek) || isNaN(period)) {
    return NextResponse.json({ error: 'Missing dayOfWeek or period' }, { status: 400 });
  }

  await prisma.timetable.deleteMany({
    where: { userId: session.user.id, dayOfWeek, period },
  });

  return NextResponse.json({ success: true });
}
