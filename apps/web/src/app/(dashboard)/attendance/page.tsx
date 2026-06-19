/**
 * 出席管理ページ
 *
 * WHY: Server Componentで出席ログ・設定をSSRで即表示。
 * 自動出席ON/OFFのトグルはClient Componentに委譲。
 */
import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { prisma } from '@chibatech/db';
import { normalizeAttendanceSettings, summarizeAttendance } from '@chibatech/shared';
import { AttendanceSettings } from './attendance-settings';
import { ConfirmFlow } from './confirm-flow';

export default async function AttendancePage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { attendanceSettings: true },
  });

  const settings = normalizeAttendanceSettings(user?.attendanceSettings ?? null);

  // confirm モードの確認フローには時間割が必要
  const timetables =
    settings.mode === 'confirm'
      ? await prisma.timetable.findMany({
          where: { userId: session.user.id },
          select: {
            id: true,
            dayOfWeek: true,
            period: true,
            className: true,
            room: true,
          },
        })
      : [];

  // 直近30日の出席ログ（統計 + 履歴）
  const since = new Date();
  since.setDate(since.getDate() - 30);

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

  const summary = summarizeAttendance(
    logs.map((l) => ({
      status: l.status,
      method: l.method,
      className: l.timetable.className,
    }))
  );

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-4">
      <h1 className="text-lg font-bold text-[#1E3A5F]">出席管理</h1>

      {/* 出席モード設定 */}
      <AttendanceSettings initialMode={settings.mode} />

      {/* confirm モードのときだけ確認フローを表示 */}
      {settings.mode === 'confirm' && <ConfirmFlow timetables={timetables} />}

      {/* 出席統計 */}
      <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-gray-500">出席統計（直近30日）</h2>
        {summary.total === 0 ? (
          <p className="text-sm text-gray-400">記録はありません</p>
        ) : (
          <div className="space-y-3">
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-[#1E3A5F]">
                {Math.round(summary.successRate * 100)}%
              </span>
              <span className="text-xs text-gray-400">
                成功率（{summary.success}/{summary.success + summary.failed}）
              </span>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
              <span>出席 {summary.success}</span>
              <span>失敗 {summary.failed}</span>
              <span>スキップ {summary.skipped}</span>
              <span className="text-gray-300">|</span>
              <span>自動 {summary.byMethod.auto}</span>
              <span>確認 {summary.byMethod.confirm}</span>
              <span>手動 {summary.byMethod.manual}</span>
            </div>
            {summary.byClass.length > 0 && (
              <ul className="space-y-1">
                {summary.byClass.map((c) => (
                  <li
                    key={c.className}
                    className="flex items-center justify-between text-xs"
                  >
                    <span className="min-w-0 flex-1 truncate text-gray-600">
                      {c.className}
                    </span>
                    <span className="text-gray-400">
                      {c.success}/{c.total}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>

      {/* 出席ログ */}
      <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-gray-500">出席ログ（直近30日）</h2>

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
