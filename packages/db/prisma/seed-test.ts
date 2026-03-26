/**
 * E2Eテスト用シードスクリプト
 *
 * WHY: Playwright E2Eテストにはログイン済みユーザーが必要。
 * CI環境で自動的にテストユーザーを作成する。
 *
 * 使用方法: npx tsx packages/db/prisma/seed-test.ts
 */
import { PrismaClient } from '@prisma/client';
import { hashSync } from 'bcryptjs';

const prisma = new PrismaClient();

const TEST_STUDENT_ID = process.env.E2E_TEST_STUDENT_ID || 'T00E2E01';
const TEST_PASSWORD = process.env.E2E_TEST_PASSWORD || 'e2e-test-password-2026';
const TEST_EMAIL = 'e2e-test@example.com';

async function main() {
  console.log(`[seed-test] Creating test user: ${TEST_STUDENT_ID}`);

  // WHY: upsertで冪等性を確保。何回実行しても同じ結果になる
  await prisma.user.upsert({
    where: { studentId: TEST_STUDENT_ID },
    update: {
      passwordHash: hashSync(TEST_PASSWORD, 12),
      email: TEST_EMAIL,
    },
    create: {
      studentId: TEST_STUDENT_ID,
      passwordHash: hashSync(TEST_PASSWORD, 12),
      email: TEST_EMAIL,
    },
  });

  console.log('[seed-test] Test user created successfully');
}

main()
  .catch((e) => {
    console.error('[seed-test] Failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
