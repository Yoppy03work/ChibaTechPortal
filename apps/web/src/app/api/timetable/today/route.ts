/**
 * 今日の時間割 API
 *
 * GET /api/timetable/today
 */
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@chibatech/db';

// WHY: 個人データを含むため、Next.jsのキャッシュを無効化
export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const dayOfWeek = new Date().getDay();

  const entries = await prisma.timetable.findMany({
    where: { userId: session.user.id, dayOfWeek },
    orderBy: { period: 'asc' },
  });

  return NextResponse.json({ entries, dayOfWeek });
}
