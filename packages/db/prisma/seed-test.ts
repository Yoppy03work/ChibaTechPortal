/**
 * E2Eテスト用シードスクリプト
 *
 * WHY: Playwright E2Eテストにはログイン済みユーザーが必要。CI環境で自動的に
 * テストユーザーを作成する。リデザイン後の画面は実データ(SSR)を表示するため、
 * 時間割・お知らせ・課題・出席ログのフィクスチャも投入する。
 *
 * 使用方法: npx tsx packages/db/prisma/seed-test.ts
 */
import { PrismaClient } from '@prisma/client';
import { hashSync } from 'bcryptjs';

const prisma = new PrismaClient();

const TEST_STUDENT_ID = process.env.E2E_TEST_STUDENT_ID || 'T00E0001';
const TEST_PASSWORD = process.env.E2E_TEST_PASSWORD || 'e2e-test-password-2026';
const TEST_EMAIL = 'e2e-test@example.com';

/** UTC midnight の日付（classDate 規約: JSTのYYYY-MM-DDをUTC midnightで保存） */
function daysAgoDate(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return new Date(d.toISOString().slice(0, 10));
}

function hoursAgo(hours: number): Date {
  return new Date(Date.now() - hours * 3600_000);
}

async function main() {
  console.log(`[seed-test] Creating test user: ${TEST_STUDENT_ID}`);

  // WHY: upsertで冪等性を確保。何回実行しても同じ結果になる
  const user = await prisma.user.upsert({
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

  // ── フィクスチャの入れ直し（テストユーザーの行のみ削除 → 再作成で冪等） ──
  await prisma.attendanceLog.deleteMany({ where: { userId: user.id } });
  await prisma.timetable.deleteMany({ where: { userId: user.id } });
  await prisma.notification.deleteMany({ where: { userId: user.id } });
  await prisma.assignment.deleteMany({ where: { userId: user.id } });

  // 時間割: 全曜日(月〜土)に授業を配置（CIがいつ走っても「今日の授業」が空にならない）
  const SUBJECTS: Array<[string, string]> = [
    ['微分積分Ⅱ', '1201'],
    ['情報理論', '2401'],
    ['データ構造', '2305'],
    ['確率統計', '1206'],
    ['線形代数Ⅱ', '1203'],
    ['電気回路', '4102'],
    ['プログラミング演習Ⅱ', 'PC3'],
    ['英語コミュニケーションⅡB', '5102'],
  ];
  const timetableData: Array<{ userId: string; dayOfWeek: number; period: number; className: string; room: string; source: string }> = [];
  for (let day = 1; day <= 6; day++) {
    for (let period = 1; period <= 4; period++) {
      const [className, room] = SUBJECTS[(day * 3 + period) % SUBJECTS.length];
      timetableData.push({ userId: user.id, dayOfWeek: day, period, className, room, source: 'manual' });
    }
  }
  await prisma.timetable.createMany({ data: timetableData });

  // お知らせ: CIT Portal / manaba の両ソース（未読含む）
  await prisma.notification.createMany({
    data: [
      { userId: user.id, source: 'cit-portal', externalId: 'e2e-n1', title: '前期末試験の時間割を公開しました', body: '試験は7月22日(月)〜26日(金)に実施します。受験要領を必ず確認してください。', isRead: false, publishedAt: hoursAgo(1) },
      { userId: user.id, source: 'manaba', externalId: 'e2e-n2', title: '情報理論：第9回 講義資料をアップロードしました', body: '第9回「通信路符号化」のスライドPDFを公開しました。', isRead: false, publishedAt: hoursAgo(3) },
      { userId: user.id, source: 'manaba', externalId: 'e2e-n3', title: 'データ構造：小テストの成績を公開しました', body: '第4回小テストの採点が完了しました。', isRead: true, publishedAt: hoursAgo(5) },
      { userId: user.id, source: 'cit-portal', externalId: 'e2e-n4', title: '学生証の更新手続きについて', body: '有効期限が近い学生は学生課窓口で更新してください。', isRead: true, publishedAt: hoursAgo(26) },
    ],
  });

  // 課題: 未提出(期限間近)/未提出/提出済
  await prisma.assignment.createMany({
    data: [
      { userId: user.id, externalId: 'e2e-a1', title: '演習課題 #5：再帰とスタック', courseName: 'プログラミング演習Ⅱ', dueDate: new Date(Date.now() + 24 * 3600_000), url: 'https://example.com/assignment/1', isCompleted: false },
      { userId: user.id, externalId: 'e2e-a2', title: 'レポート第3回：情報源符号化', courseName: '情報理論', dueDate: new Date(Date.now() + 5 * 24 * 3600_000), url: 'https://example.com/assignment/2', isCompleted: false },
      { userId: user.id, externalId: 'e2e-a3', title: '小テスト 復習課題', courseName: '確率統計', dueDate: new Date(Date.now() - 2 * 24 * 3600_000), url: 'https://example.com/assignment/3', isCompleted: true },
    ],
  });

  // 出席ログ: 出席率サマリー用（情報理論=成功3、確率統計=成功2/失敗1）
  const infoRow = await prisma.timetable.findFirst({ where: { userId: user.id, className: '情報理論' } });
  const probRow = await prisma.timetable.findFirst({ where: { userId: user.id, className: '確率統計' } });
  if (infoRow && probRow) {
    await prisma.attendanceLog.createMany({
      data: [
        { userId: user.id, timetableId: infoRow.id, classDate: daysAgoDate(7), status: 'success', method: 'confirm' },
        { userId: user.id, timetableId: infoRow.id, classDate: daysAgoDate(14), status: 'success', method: 'confirm' },
        { userId: user.id, timetableId: infoRow.id, classDate: daysAgoDate(21), status: 'success', method: 'manual' },
        { userId: user.id, timetableId: probRow.id, classDate: daysAgoDate(7), status: 'success', method: 'confirm' },
        { userId: user.id, timetableId: probRow.id, classDate: daysAgoDate(14), status: 'failed', method: 'confirm' },
        { userId: user.id, timetableId: probRow.id, classDate: daysAgoDate(21), status: 'success', method: 'confirm' },
      ],
    });
  }

  console.log('[seed-test] Test user + fixtures created successfully');
}

main()
  .catch((e) => {
    console.error('[seed-test] Failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
