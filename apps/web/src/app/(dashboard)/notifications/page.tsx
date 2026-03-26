/**
 * お知らせ一覧ページ
 */
import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { prisma } from '@chibatech/db';
import Link from 'next/link';

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ source?: string; unread?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');

  const params = await searchParams;
  const sourceFilter = params.source;
  const unreadOnly = params.unread === 'true';

  const where = {
    userId: session.user.id,
    ...(sourceFilter && sourceFilter !== 'all' ? { source: sourceFilter } : {}),
    ...(unreadOnly ? { isRead: false } : {}),
  };

  const notifications = await prisma.notification.findMany({
    where,
    orderBy: { publishedAt: 'desc' },
    take: 50,
  });

  return (
    <main className="mx-auto max-w-2xl space-y-4 p-4">
      <h1 className="text-lg font-bold text-[#1E3A5F]">お知らせ</h1>

      {/* フィルタ */}
      <div className="flex gap-2 text-xs">
        <FilterLink label="全て" href="/notifications" active={!sourceFilter} />
        <FilterLink label="CIT Portal" href="/notifications?source=cit-portal" active={sourceFilter === 'cit-portal'} />
        <FilterLink label="manaba" href="/notifications?source=manaba" active={sourceFilter === 'manaba'} />
        <FilterLink
          label="未読のみ"
          href={`/notifications?unread=true${sourceFilter ? `&source=${sourceFilter}` : ''}`}
          active={unreadOnly}
        />
      </div>

      {/* 一覧 */}
      {notifications.length === 0 ? (
        <p className="text-sm text-gray-400">お知らせはありません</p>
      ) : (
        <ul className="space-y-2">
          {notifications.map((notif) => (
            <li key={notif.id}>
              <Link
                href={`/notifications/${notif.id}`}
                className="block rounded-lg border border-gray-200 bg-white p-3 shadow-sm hover:bg-blue-50"
              >
                <div className="flex items-start gap-2">
                  <span
                    className={`mt-1.5 h-2 w-2 flex-shrink-0 rounded-full ${
                      notif.source === 'cit-portal' ? 'bg-[#1E3A5F]' : 'bg-[#2563EB]'
                    }`}
                  />
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm ${notif.isRead ? 'text-gray-500' : 'font-medium text-gray-900'}`}>
                      {notif.title}
                    </p>
                    <div className="mt-1 flex items-center gap-2 text-xs text-gray-400">
                      <span>{notif.source === 'cit-portal' ? 'CIT Portal' : 'manaba'}</span>
                      <span>{new Date(notif.publishedAt).toLocaleDateString('ja-JP')}</span>
                      {!notif.isRead && (
                        <span className="rounded-full bg-red-500 px-1.5 text-white">NEW</span>
                      )}
                    </div>
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

function FilterLink({ label, href, active }: { label: string; href: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={`rounded-full px-3 py-1 ${
        active
          ? 'bg-[#2563EB] text-white'
          : 'border border-gray-300 text-gray-600 hover:bg-gray-100'
      }`}
    >
      {label}
    </Link>
  );
}
