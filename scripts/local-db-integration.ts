/**
 * ローカル DB 統合スモーク（CIT 不要・決定的・時刻非依存）
 *
 * WHY: M1/M2/M3 で追加した schema（AttendanceQrSession, Timetable.source,
 * AttendanceLog の pending claim + @@unique）と、Worker が実際に発行するクエリが、
 * モックではなく実 Postgres に対して動くことを実証する。ユニットテストは Prisma を
 * モックするので、この DB 層の検証を補完する（= 「M1/M2 が実インフラで動く」証跡）。
 *
 * 使い方:
 *   DATABASE_URL='postgresql://postgres:postgres@localhost:5433/chibatech_portal_test' \
 *     npx tsx scripts/local-db-integration.ts
 */
import { prisma } from '@chibatech/db';
import { summarizeAttendance } from '@chibatech/shared';

const SFX = 'dbsmoke';
const userId = `user-${SFX}`;
const timetableId = `tt-${SFX}`;
const roomId = '8109';
const classDate = new Date('2026-05-04'); // UTC midnight = @db.Date キー（qr-validate/worker と同一規約）

async function cleanup() {
  await prisma.attendanceLog.deleteMany({ where: { userId } });
  await prisma.attendanceQrSession.deleteMany({ where: { userId } });
  await prisma.timetable.deleteMany({ where: { userId } });
  await prisma.user.deleteMany({ where: { id: userId } });
}

async function main() {
  await cleanup();
  const checks: string[] = [];

  // 1. user + timetable(source) を実 DB に作成
  await prisma.user.create({
    data: {
      id: userId,
      studentId: `S-${SFX}`,
      email: 'smoke@example.com',
      passwordHash: 'x',
      attendanceSettings: { mode: 'auto' },
    },
  });
  await prisma.timetable.create({
    data: {
      id: timetableId,
      userId,
      dayOfWeek: 1,
      period: 1,
      className: 'スモーク授業',
      room: roomId,
      source: 'manual',
    },
  });
  checks.push('user + timetable(source 列) を実 Postgres に作成');

  // 2. AttendanceQrSession: create + Worker と同一の複合キー findUnique
  await prisma.attendanceQrSession.create({
    data: { userId, roomId, timetableId, classDate, expiresAt: new Date(Date.now() + 30 * 60 * 1000) },
  });
  const session = await prisma.attendanceQrSession.findUnique({
    where: { userId_roomId_classDate: { userId, roomId, classDate } },
  });
  if (!session) throw new Error('AttendanceQrSession を複合キー findUnique で取得できない');
  const qrValid =
    session.expiresAt > new Date() && session.roomId === roomId && session.timetableId === timetableId;
  if (!qrValid) throw new Error('qrSessionValid 相当の判定が false');
  checks.push('AttendanceQrSession の create + 複合キー findUnique（auto guard と同一クエリ）が動作');

  // 3. claim フロー: pending create → success 遷移 + @@unique による二重 create 防止
  await prisma.attendanceLog.create({
    data: { userId, timetableId, classDate, method: 'auto', status: 'pending' },
  });
  const updated = await prisma.attendanceLog.updateMany({
    where: { userId, timetableId, classDate, method: 'auto' },
    data: { status: 'success' },
  });
  if (updated.count !== 1) throw new Error(`pending→success の updateMany count=${updated.count}`);
  let p2002 = false;
  try {
    await prisma.attendanceLog.create({
      data: { userId, timetableId, classDate, method: 'auto', status: 'pending' },
    });
  } catch (e: unknown) {
    p2002 = (e as { code?: string })?.code === 'P2002';
  }
  if (!p2002) throw new Error('@@unique([userId,timetableId,classDate,method]) が効いていない');
  checks.push('claim: pending create → success 遷移 + @@unique による二重 create 防止が動作');

  // 4. summarizeAttendance を実行行で計算
  const logs = await prisma.attendanceLog.findMany({
    where: { userId },
    include: { timetable: { select: { className: true } } },
  });
  const summary = summarizeAttendance(
    logs.map((l) => ({ status: l.status, method: l.method, className: l.timetable.className }))
  );
  if (summary.success !== 1) throw new Error(`summary.success=${summary.success} (期待 1)`);
  checks.push(
    `summarizeAttendance（実行行）: success=${summary.success} / successRate=${Math.round(summary.successRate * 100)}%`
  );

  await cleanup();
  checks.push('cleanup 完了（seed 削除）');

  console.log('\n=== ローカル DB 統合スモーク: 全て成功（CIT 不要・実 Postgres） ===');
  checks.forEach((c, i) => console.log(`  ${i + 1}. ✓ ${c}`));
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error('\n=== FAILED ===\n', e);
    await prisma.$disconnect();
    process.exit(1);
  });
