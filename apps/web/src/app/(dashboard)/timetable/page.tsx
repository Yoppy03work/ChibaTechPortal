/**
 * 時間割ページ
 *
 * WHY: SSRで時間割をグリッド表示。追加/削除はClient Componentに委譲。
 */
import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { prisma } from '@chibatech/db';
import { TimetableGrid } from './timetable-grid';

const DAY_LABELS = ['日', '月', '火', '水', '木', '金', '土'];

export default async function TimetablePage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');

  const entries = await prisma.timetable.findMany({
    where: { userId: session.user.id },
    orderBy: [{ dayOfWeek: 'asc' }, { period: 'asc' }],
  });

  // グリッド用に変換: { "1-1": { className, room }, "1-2": ... }
  const grid: Record<string, { id: string; className: string; room: string | null }> = {};
  for (const e of entries) {
    grid[`${e.dayOfWeek}-${e.period}`] = {
      id: e.id,
      className: e.className,
      room: e.room,
    };
  }

  return (
    <main className="mx-auto max-w-2xl space-y-4 p-4">
      <h1 className="text-lg font-bold text-[#1E3A5F]">時間割</h1>
      <TimetableGrid initialGrid={grid} dayLabels={DAY_LABELS} />
    </main>
  );
}
