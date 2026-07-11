/**
 * シラバス — 設計 isSyl 画面・実データ版。
 *
 * WHY: 履修中の科目＝時間割の科目（syllabusId で Syllabus に紐付く）。
 * Server Component で timetable+syllabus を取得し、選択・検索は syllabus-view に委譲。
 */
import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { prisma } from '@chibatech/db';
import { SyllabusView, type SyllabusCourse } from './syllabus-view';

export const dynamic = 'force-dynamic';

const WD = ['日', '月', '火', '水', '木', '金', '土'];

/** 科目コードチップ: courseCode があれば2段表示、無ければ科目名の先頭2文字 */
function codeChip(courseCode: string | null | undefined, name: string): string {
  if (courseCode) {
    const m = courseCode.match(/^([A-Za-z]+)[-_ ]?(\d+)$/);
    if (m) return `${m[1].toUpperCase()}\n${m[2]}`;
    return courseCode.length > 5 ? `${courseCode.slice(0, 4)}\n${courseCode.slice(4, 8)}` : courseCode;
  }
  return name.slice(0, 2);
}

export default async function SyllabusPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');

  const rows = await prisma.timetable.findMany({
    where: { userId: session.user.id },
    include: { syllabus: true },
    orderBy: [{ dayOfWeek: 'asc' }, { period: 'asc' }],
  });

  // WHY: 複数コマ持ちの科目は1つに集約（シラバス付きのコマを優先）
  const byName = new Map<string, (typeof rows)[number]>();
  for (const r of rows) {
    const cur = byName.get(r.className);
    if (!cur || (!cur.syllabus && r.syllabus)) byName.set(r.className, r);
  }

  const courses: SyllabusCourse[] = [...byName.values()].map((r) => {
    const s = r.syllabus;
    return {
      key: r.className,
      name: r.className,
      code: codeChip(s?.courseCode, r.className),
      instructor: s?.instructor ?? '',
      slot: `${WD[r.dayOfWeek] ?? ''}${r.period}`,
      category: s?.category ?? null,
      objectives: s?.objectives ?? null,
      schedule: s?.schedule ?? null,
      evaluation: s?.evaluation ?? null,
      textbooks: s?.textbooks ?? null,
      originalUrl: s?.originalUrl ?? null,
      hasSyllabus: !!s,
    };
  });

  return <SyllabusView courses={courses} />;
}
