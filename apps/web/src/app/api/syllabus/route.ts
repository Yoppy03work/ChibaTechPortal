/**
 * シラバス API
 *
 * GET /api/syllabus?timetableId=xxx
 * 時間割エントリに紐付くシラバス情報を返す
 */
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@chibatech/db';

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const timetableId = searchParams.get('timetableId');

  if (timetableId) {
    // 特定の時間割エントリのシラバス
    const entry = await prisma.timetable.findFirst({
      where: { id: timetableId, userId: session.user.id },
      include: { syllabus: true },
    });

    if (!entry) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    return NextResponse.json({ syllabus: entry.syllabus });
  }

  // 全シラバス（ユーザーの時間割に紐付くもの）
  const entries = await prisma.timetable.findMany({
    where: { userId: session.user.id, syllabusId: { not: null } },
    include: { syllabus: true },
    orderBy: [{ dayOfWeek: 'asc' }, { period: 'asc' }],
  });

  return NextResponse.json({
    syllabi: entries.map((e) => ({
      timetableId: e.id,
      className: e.className,
      dayOfWeek: e.dayOfWeek,
      period: e.period,
      syllabus: e.syllabus,
    })),
  });
}
