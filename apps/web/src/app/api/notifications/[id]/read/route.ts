/**
 * 既読マーク API
 *
 * PATCH /api/notifications/:id/read
 */
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@chibatech/db';
import { validateStateChangingRequest } from '@/lib/api-guard';

// WHY: 個人データに関わるため、キャッシュ方針を統一
export const dynamic = 'force-dynamic';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = validateStateChangingRequest(request);
  if (guard) return guard;

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  // WHY: 自分のお知らせのみ既読にできる（他ユーザーのデータへのアクセス防止）
  const notification = await prisma.notification.findFirst({
    where: { id, userId: session.user.id },
  });

  if (!notification) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  await prisma.notification.update({
    where: { id },
    data: { isRead: true },
  });

  return NextResponse.json({ success: true });
}
