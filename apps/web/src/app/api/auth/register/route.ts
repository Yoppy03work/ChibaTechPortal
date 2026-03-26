/**
 * ユーザー登録 API
 *
 * POST /api/auth/register
 */
import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@chibatech/db';
import { registerSchema, InMemoryRateLimiter, RATE_LIMITS } from '@chibatech/shared';

// WHY: bcryptのコストファクターは12が推奨（10は最低ライン）
const BCRYPT_ROUNDS = 12;

// WHY: 登録APIへの総当たり・列挙攻撃を防止
const rateLimiter = new InMemoryRateLimiter();

export async function POST(request: Request) {
  // レートリミット: IPベース
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const rateResult = await rateLimiter.check(`register:${ip}`, RATE_LIMITS.login);
  if (!rateResult.allowed) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil((rateResult.resetAt.getTime() - Date.now()) / 1000)) } }
    );
  }

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

  // WHY: パスワードはbcryptでハッシュ化。平文は絶対にDBに保存しない
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  try {
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
  } catch {
    // WHY: 重複・その他のエラーを区別せず同一レスポンスを返し、学籍番号の存在列挙を防ぐ
    return NextResponse.json(
      { error: 'Registration failed' },
      { status: 409 }
    );
  }
}
