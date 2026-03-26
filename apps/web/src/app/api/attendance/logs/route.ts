/**
 * 出席ログ API
 *
 * GET /api/attendance/logs?days=7
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { prisma } from '@chibatech/db';

// WHY: 個人データを含むため、Next.jsのキャッシュを無効化
export const dynamic = 'force-dynamic';

// WHY: 全APIエンドポイントでZodバリデーション必須の方針に従う
const logsQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(30).default(7),
});

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const parsed = logsQuerySchema.safeParse({
    days: searchParams.get('days') ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { days } = parsed.data;

  const since = new Date();
  since.setDate(since.getDate() - days);

  const logs = await prisma.attendanceLog.findMany({
    where: {
      userId: session.user.id,
      classDate: { gte: since },
    },
    include: {
      timetable: {
        select: { className: true, room: true, period: true },
      },
    },
    orderBy: { classDate: 'desc' },
  });

  return NextResponse.json({ logs });
}
