/**
 * ユーザー登録 API
 *
 * POST /api/auth/register
 */
import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@chibatech/db';
import { registerSchema, RATE_LIMITS, getClientIp } from '@chibatech/shared';
import { rateLimiter } from '@/lib/rate-limiter';

// WHY: bcryptのコストファクターは12が推奨（10は最低ライン）
// WHY: 認証に関わるため、キャッシュ方針を統一
export const dynamic = 'force-dynamic';

const BCRYPT_ROUNDS = 12;

export async function POST(request: Request) {
  // WHY: 信頼できるプロキシチェーンからクライアントIPを抽出（偽装耐性あり）
  // IPが取得できない場合はIPベースリミットをスキップ（共有バケット問題を回避）
  const ip = getClientIp(request.headers);
  if (ip) {
    const rateResult = await rateLimiter.check(`register:${ip}`, RATE_LIMITS.login);
    if (!rateResult.allowed) {
      return NextResponse.json(
        { error: 'Too many requests' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil((rateResult.resetAt.getTime() - Date.now()) / 1000)) } }
      );
    }
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
