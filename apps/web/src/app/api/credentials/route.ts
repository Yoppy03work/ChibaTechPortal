/**
 * 認証情報登録・更新 API
 *
 * PUT /api/credentials
 *
 * WHY: ユーザーのCIT Portal/manaba認証情報をAES-256-GCMで暗号化してDBに保存する。
 * 平文は一切DBに保存しない。復号キー（マスターキー）は環境変数で管理。
 */
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@chibatech/db';
import {
  credentialSchema,
  createEncryptionService,
  getMasterKey,
} from '@chibatech/shared';

const encryptionService = createEncryptionService();

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

  const parsed = credentialSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { citPortalUserId, citPortalPassword, manabaUserId, manabaPassword } = parsed.data;

  try {
    const masterKey = getMasterKey();

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

    // WHY: マスターキーのBuffer参照を明示的にクリア（GC促進）
    masterKey.fill(0);

    return NextResponse.json({ success: true });
  } catch (error) {
    // WHY: エラーメッセージに認証情報が含まれないようにする
    console.error('Failed to save credentials:', error instanceof Error ? error.message : 'Unknown error');
    return NextResponse.json({ error: 'Failed to save credentials' }, { status: 500 });
  }
}
