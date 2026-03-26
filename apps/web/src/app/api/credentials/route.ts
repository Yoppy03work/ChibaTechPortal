/**
 * 認証情報登録・更新 API
 *
 * PUT /api/credentials
 *
 * WHY: ユーザーのCIT Portal/manaba認証情報をAES-256-GCMで暗号化してDBに保存する。
 * クライアントからは平文で送信されるが、サーバー側で即座に暗号化しDBには暗号文のみ保存する。
 * 復号キー（マスターキー）は環境変数で管理。
 */
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@chibatech/db';
import {
  credentialSchema,
  createEncryptionService,
  getMasterKey,
  InMemoryRateLimiter,
  RATE_LIMITS,
} from '@chibatech/shared';

const encryptionService = createEncryptionService();

// WHY: 認証情報更新の乱用を防止（1時間に3回まで）
const rateLimiter = new InMemoryRateLimiter();

export async function PUT(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // レートリミット: ユーザーIDベース
  const rateResult = await rateLimiter.check(`cred:${session.user.id}`, RATE_LIMITS.credentialUpdate);
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

  const parsed = credentialSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { citPortalUserId, citPortalPassword, manabaUserId, manabaPassword } = parsed.data;

  const masterKey = getMasterKey();

  try {
    // WHY: 認証情報をJSON化してペアで暗号化し、ユーザーIDとパスワードが常にセットで管理される
    const citCreds = (citPortalUserId && citPortalPassword)
      ? encryptionService.encrypt(
          JSON.stringify({ userId: citPortalUserId, password: citPortalPassword }),
          masterKey
        )
      : null;

    const manabaCreds = (manabaUserId && manabaPassword)
      ? encryptionService.encrypt(
          JSON.stringify({ userId: manabaUserId, password: manabaPassword }),
          masterKey
        )
      : null;

    await prisma.user.update({
      where: { id: session.user.id },
      data: {
        encryptedCitCreds: citCreds ? Buffer.from(JSON.stringify(citCreds)) : undefined,
        encryptedManabaCreds: manabaCreds ? Buffer.from(JSON.stringify(manabaCreds)) : undefined,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    // WHY: エラーメッセージに認証情報が含まれないようにする
    console.error('Failed to save credentials:', error instanceof Error ? error.message : 'Unknown error');
    return NextResponse.json({ error: 'Failed to save credentials' }, { status: 500 });
  } finally {
    // WHY: 成功・失敗に関わらずマスターキーのBuffer参照を確実にゼロ化
    masterKey.fill(0);
  }
}
