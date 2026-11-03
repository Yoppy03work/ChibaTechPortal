/**
 * 出席設定 API
 *
 * GET: 現在の設定を `{ mode, autoUnlocked, autoConfigured }` で返す
 * PUT: `{ mode, devCode? }` を受け付ける。auto は開発者コード検証に通ったときだけ解禁。
 *
 * WHY: auto の解禁はサーバー側でのみ付与する。client から autoUnlocked を直接
 * 受け取らない（受け取ると開発者コード検証を迂回して誰でも auto にできてしまう）。
 * 旧形式 `{ autoAttend: boolean }` の DB 行は normalizeAttendanceSettings() で吸収。
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { prisma } from '@chibatech/db';
import {
  attendanceModeSchema,
  normalizeAttendanceSettings,
  isAutoDevCodeConfigured,
  verifyAutoDevCode,
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

  const s = normalizeAttendanceSettings(user?.attendanceSettings ?? null);
  // autoConfigured: 開発者コードが設定されているか（UI が auto を解禁可能として出すか判断）。
  return NextResponse.json({
    mode: s.mode,
    autoUnlocked: s.autoUnlocked,
    autoConfigured: isAutoDevCodeConfigured(),
  });
}

// WHY: PUT の受け口は attendanceSettingsSchema を使わない。autoUnlocked を client から
// 直接受け取れてしまうと開発者コード検証を迂回できるため、mode + 任意の devCode のみ受ける。
const putBodySchema = z.object({
  mode: attendanceModeSchema,
  devCode: z.string().max(200).optional(),
});

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

  const parsed = putBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed' }, { status: 400 });
  }

  if (parsed.data.mode === 'auto') {
    // auto は開発者コード検証に通ったときだけ解禁。未設定/不一致は 403（fail-closed）。
    if (!isAutoDevCodeConfigured()) {
      return NextResponse.json(
        { error: 'auto_locked', message: 'auto は無効です（開発者コード未設定）' },
        { status: 403 }
      );
    }
    if (!parsed.data.devCode || !verifyAutoDevCode(parsed.data.devCode)) {
      return NextResponse.json(
        { error: 'bad_dev_code', message: '開発者コードが違います' },
        { status: 403 }
      );
    }
    await prisma.user.update({
      where: { id: session.user.id },
      data: { attendanceSettings: { mode: 'auto', autoUnlocked: true } },
    });
    return NextResponse.json({ success: true, mode: 'auto' });
  }

  // auto 以外は autoUnlocked を必ず落とす（mode を戻したら解禁も解除）。
  await prisma.user.update({
    where: { id: session.user.id },
    data: { attendanceSettings: { mode: parsed.data.mode, autoUnlocked: false } },
  });
  return NextResponse.json({ success: true, mode: parsed.data.mode });
}
