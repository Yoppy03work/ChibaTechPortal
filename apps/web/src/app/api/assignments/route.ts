/**
 * 課題一覧 API
 *
 * GET /api/assignments?completed=false
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
  const showCompleted = searchParams.get('completed') === 'true';

  const assignments = await prisma.assignment.findMany({
    where: {
      userId: session.user.id,
      ...(showCompleted ? {} : { isCompleted: false }),
    },
    orderBy: [
      { dueDate: 'asc' }, // 締切が近い順
      { fetchedAt: 'desc' },
    ],
  });

  return NextResponse.json({ assignments });
}
