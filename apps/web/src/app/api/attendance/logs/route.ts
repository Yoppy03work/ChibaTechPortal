/**
 * 出席ログ API
 *
 * GET /api/attendance/logs?days=7
 */
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@chibatech/db';

// WHY: 個人データを含むため、Next.jsのキャッシュを無効化
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const days = Math.min(parseInt(searchParams.get('days') || '7', 10), 30);

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
