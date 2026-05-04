/**
 * 出席設定 API
 *
 * GET: 現在の設定を `{ mode }` 形式に正規化して返す
 * PUT: 新形式 `{ mode: AttendanceMode }` を受け付けて保存
 *
 * WHY: 旧形式 `{ autoAttend: boolean }` の DB 行は normalizeAttendanceSettings() で
 * 吸収し、API は常に新形式を返す/受ける。
 */
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@chibatech/db';
import {
  attendanceSettingsSchema,
  normalizeAttendanceSettings,
} from '@chibatech/shared';
import { validateStateChangingRequest } from '@/lib/api-guard';

// WHY: 個人データを含むため Next.js のキャッシュを無効化
export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { attendanceSettings: true },
  });

  return NextResponse.json(normalizeAttendanceSettings(user?.attendanceSettings ?? null));
}

export async function PUT(request: Request) {
  const guard = validateStateChangingRequest(request, { requireJson: true });
  if (guard) return guard;

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

  // WHY: zod で `{ mode: 'manual' | 'confirm' | 'auto' }` を厳密に検証
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
