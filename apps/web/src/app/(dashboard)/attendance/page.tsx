/**
 * 出席管理ページ
 *
 * WHY: Server Componentで出席ログ・設定をSSRで即表示。
 * 自動出席ON/OFFのトグルはClient Componentに委譲。
 */
import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { prisma } from '@chibatech/db';
import { normalizeAttendanceSettings } from '@chibatech/shared';
import { AttendanceSettings } from './attendance-settings';

export default async function AttendancePage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { attendanceSettings: true },
  });

  const settings = normalizeAttendanceSettings(user?.attendanceSettings ?? null);

  // 直近7日の出席ログ
  const since = new Date();
  since.setDate(since.getDate() - 7);

  const logs = await prisma.attendanceLog.findMany({
    where: {
      userId: session.user.id,
      classDate: { gte: since },
    },
    include: {
      timetable: { select: { className: true, room: true, period: true } },
    },
    orderBy: { classDate: 'desc' },
  });

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-4">
      <h1 className="text-lg font-bold text-[#1E3A5F]">出席管理</h1>

      {/* 出席モード設定 */}
      <AttendanceSettings initialMode={settings.mode} />

      {/* 出席ログ */}
      <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-gray-500">出席ログ（直近7日）</h2>

        {logs.length === 0 ? (
          <p className="text-sm text-gray-400">出席記録はありません</p>
        ) : (
          <div className="space-y-2">
            {logs.map((log) => (
              <div
                key={log.id}
                className="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">
                    {log.timetable.period}限 {log.timetable.className}
                  </p>
                  <p className="text-xs text-gray-400">
                    {new Date(log.classDate).toLocaleDateString('ja-JP')}
                    {log.timetable.room ? ` / ${log.timetable.room}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      log.status === 'success'
                        ? 'bg-green-100 text-green-700'
                        : log.status === 'failed'
                          ? 'bg-red-100 text-red-700'
                          : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    {log.status === 'success' ? '出席' : log.status === 'failed' ? '失敗' : log.status}
                  </span>
                  <span className="text-xs text-gray-400">
                    {log.method === 'auto' ? '自動' : '手動'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
