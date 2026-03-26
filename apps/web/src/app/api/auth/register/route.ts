/**
 * ユーザー登録 API
 *
 * POST /api/auth/register
 */
import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@chibatech/db';
import { registerSchema } from '@chibatech/shared';

// WHY: bcryptのコストファクターは12が推奨（10は最低ライン）
const BCRYPT_ROUNDS = 12;

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { studentId, password, email } = parsed.data;

  // 重複チェック
  const existing = await prisma.user.findUnique({
    where: { studentId },
  });

  if (existing) {
    return NextResponse.json(
      { error: 'Student ID already registered' },
      { status: 409 }
    );
  }

  // WHY: パスワードはbcryptでハッシュ化。平文は絶対にDBに保存しない
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  const user = await prisma.user.create({
    data: {
      studentId,
      email,
      passwordHash,
    },
  });

  return NextResponse.json(
    { id: user.id, studentId: user.studentId },
    { status: 201 }
  );
}
