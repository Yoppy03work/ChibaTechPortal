/**
 * ダッシュボード（メイン画面）
 *
 * WHY: Server Componentでお知らせ・次の授業をDBから取得し、SSRで即表示。
 */
import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { prisma } from '@chibatech/db';

// WHY: 個人データを含むSSRページ。キャッシュされると他ユーザーのデータが表示されるリスクがある
export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect('/login');
  }

  const studentId = (session.user as { studentId?: string }).studentId || '';

  // 最新のお知らせ5件
  const notifications = await prisma.notification.findMany({
    where: { userId: session.user.id },
    orderBy: { publishedAt: 'desc' },
    take: 5,
  });

  // 未完了の課題（締切順、上位3件）
  const assignments = await prisma.assignment.findMany({
    where: { userId: session.user.id, isCompleted: false },
    orderBy: { dueDate: 'asc' },
    take: 3,
  });

  // 未読件数
  const unreadCount = await prisma.notification.count({
    where: { userId: session.user.id, isRead: false },
  });

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-4">
      {/* ヘッダー */}
      <header className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-[#1E3A5F]">
          <span className="text-[#60A5FA]">CTP</span> Dashboard
        </h1>
        <span className="text-sm text-gray-500">{studentId}</span>
      </header>

      {/* 次の授業カード */}
      <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-gray-500">次の授業</h2>
        <p className="mt-1 text-lg font-bold">時間割未設定</p>
        <p className="text-sm text-gray-400">設定画面から時間割を登録してください</p>
      </section>

      {/* 今日の時間割 */}
      <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <h2 className="mb-2 text-sm font-semibold text-gray-500">今日の時間割</h2>
        <p className="text-sm text-gray-400">時間割が登録されていません</p>
      </section>

      {/* 最新のお知らせ */}
      <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-500">最新のお知らせ</h2>
          {unreadCount > 0 && (
            <span className="rounded-full bg-red-500 px-2 py-0.5 text-xs text-white">
              {unreadCount}
            </span>
          )}
        </div>

        {notifications.length === 0 ? (
          <p className="text-sm text-gray-400">
            お知らせはまだありません。CIT Portal/manabaの認証情報を設定すると自動取得されます。
          </p>
        ) : (
          <ul className="space-y-2">
            {notifications.map((notif) => (
              <li key={notif.id} className="flex items-start gap-2 text-sm">
                <span
                  className={`mt-1 inline-block h-2 w-2 flex-shrink-0 rounded-full ${
                    notif.source === 'cit-portal' ? 'bg-[#1E3A5F]' : 'bg-[#2563EB]'
                  }`}
                />
                <div className="min-w-0 flex-1">
                  <p className={`truncate ${notif.isRead ? 'text-gray-500' : 'font-medium text-gray-900'}`}>
                    {notif.title}
                  </p>
                  <p className="text-xs text-gray-400">
                    {notif.source === 'cit-portal' ? 'CIT Portal' : 'manaba'}
                    {' '}
                    {new Date(notif.publishedAt).toLocaleDateString('ja-JP')}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 課題 */}
      <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <h2 className="mb-2 text-sm font-semibold text-gray-500">締切が近い課題</h2>
        {assignments.length === 0 ? (
          <p className="text-sm text-gray-400">未完了の課題はありません</p>
        ) : (
          <ul className="space-y-2">
            {assignments.map((a) => {
              const isOverdue = a.dueDate && new Date(a.dueDate) < new Date();
              return (
                <li key={a.id} className="flex items-center justify-between text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{a.title}</p>
                    <p className="text-xs text-gray-400">{a.courseName}</p>
                  </div>
                  {a.dueDate && (
                    <span className={`ml-2 flex-shrink-0 text-xs ${isOverdue ? 'font-bold text-red-600' : 'text-amber-600'}`}>
                      {new Date(a.dueDate).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' })}〆
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}
