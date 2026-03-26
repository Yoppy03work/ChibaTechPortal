/**
 * 出席設定 API
 *
 * GET: 現在の設定を取得
 * PUT: 設定を更新
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { prisma } from '@chibatech/db';

const attendanceSettingsSchema = z.object({
  autoAttend: z.boolean(),
});

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { attendanceSettings: true },
  });

  const settings = (user?.attendanceSettings as { autoAttend?: boolean } | null) ?? {
    autoAttend: false,
  };

  return NextResponse.json(settings);
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

  const parsed = attendanceSettingsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed' }, { status: 400 });
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: { attendanceSettings: parsed.data },
  });

  return NextResponse.json({ success: true });
}
