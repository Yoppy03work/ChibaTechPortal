/**
 * 出席統計 API
 *
 * GET /api/attendance/stats?days=30
 *
 * WHY: 指定期間の AttendanceLog を集計して成功率・方式別・授業別の統計を返す。
 * 計算は shared の summarizeAttendance に委譲（純関数・テスト済み）。
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { prisma } from '@chibatech/db';
import { summarizeAttendance } from '@chibatech/shared';

// WHY: 個人データを含むため Next.js キャッシュを無効化
export const dynamic = 'force-dynamic';

const statsQuerySchema = z.object({
  // WHY: 1 学期 (~120 日) までの範囲を許容
  days: z.coerce.number().int().min(1).max(120).default(30),
});

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const parsed = statsQuerySchema.safeParse({
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
    where: { userId: session.user.id, classDate: { gte: since } },
    select: {
      status: true,
      method: true,
      timetable: { select: { className: true } },
    },
  });

  const summary = summarizeAttendance(
    logs.map((l) => ({
      status: l.status,
      method: l.method,
      className: l.timetable.className,
    }))
  );

  return NextResponse.json({ days, summary });
}
