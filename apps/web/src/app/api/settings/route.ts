/**
 * ユーザー設定 API
 *
 * GET: 通知設定取得
 * PUT: 通知設定更新
 */
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@chibatech/db';
import { notificationSettingsSchema } from '@chibatech/shared';

// WHY: 個人データを含むため、Next.jsのキャッシュを無効化
export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      notificationSettings: true,
      email: true,
      encryptedCitCreds: true,
      encryptedManabaCreds: true,
    },
  });

  return NextResponse.json({
    notificationSettings: user?.notificationSettings ?? {
      pushEnabled: true,
      emailEnabled: true,
      sources: ['cit-portal', 'manaba'],
    },
    email: user?.email,
    hasCitCreds: !!user?.encryptedCitCreds,
    hasManabaCreds: !!user?.encryptedManabaCreds,
  });
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

  const parsed = notificationSettingsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed' }, { status: 400 });
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: { notificationSettings: parsed.data },
  });

  return NextResponse.json({ success: true });
}
