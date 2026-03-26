/**
 * お知らせ一覧 API
 *
 * GET /api/notifications?source=cit-portal&isRead=false&limit=20&offset=0
 */
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@chibatech/db';
import { notificationFilterSchema } from '@chibatech/shared';

// WHY: 個人データを含むため、Next.jsのキャッシュを無効化
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const parsed = notificationFilterSchema.safeParse({
    source: searchParams.get('source') || undefined,
    isRead: searchParams.has('isRead') ? searchParams.get('isRead') === 'true' : undefined,
    limit: searchParams.has('limit') ? Number(searchParams.get('limit')) : undefined,
    offset: searchParams.has('offset') ? Number(searchParams.get('offset')) : undefined,
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { source, isRead, limit, offset } = parsed.data;

  const where = {
    userId: session.user.id,
    ...(source && source !== 'all' ? { source } : {}),
    ...(isRead !== undefined ? { isRead } : {}),
  };

  const [notifications, total] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: { publishedAt: 'desc' },
      take: limit,
      skip: offset,
    }),
    prisma.notification.count({ where }),
  ]);

  return NextResponse.json({
    notifications,
    total,
    limit,
    offset,
  });
}
