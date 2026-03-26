/**
 * お知らせ詳細ページ
 *
 * WHY: 表示時に自動で既読マークを付ける。元ページへのリンクも提供。
 */
import { auth } from '@/lib/auth';
import { redirect, notFound } from 'next/navigation';
import { prisma } from '@chibatech/db';
import Link from 'next/link';

export default async function NotificationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');

  const { id } = await params;

  // WHY: 自分のお知らせのみ閲覧可能（他ユーザーのデータアクセス防止）
  const notification = await prisma.notification.findFirst({
    where: { id, userId: session.user.id },
  });

  if (!notification) notFound();

  // 表示時に既読マーク
  if (!notification.isRead) {
    await prisma.notification.update({
      where: { id },
      data: { isRead: true },
    });
  }

  return (
    <main className="mx-auto max-w-2xl space-y-4 p-4">
      <Link href="/notifications" className="text-sm text-[#2563EB] hover:underline">
        ← お知らせ一覧
      </Link>

      <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center gap-2">
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium text-white ${
              notification.source === 'cit-portal'
                ? 'bg-[#1E3A5F]'
                : notification.source === 'attendance'
                  ? 'bg-emerald-600'
                  : 'bg-[#2563EB]'
            }`}
          >
            {notification.source === 'cit-portal'
              ? 'CIT Portal'
              : notification.source === 'attendance'
                ? '出席システム'
                : 'manaba'}
          </span>
          <span className="text-xs text-gray-400">
            {new Date(notification.publishedAt).toLocaleDateString('ja-JP', {
              year: 'numeric',
              month: '2-digit',
              day: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
        </div>

        <h1 className="mb-4 text-lg font-bold text-[#0A0A0A]">{notification.title}</h1>

        {notification.body ? (
          <div className="whitespace-pre-wrap text-sm leading-relaxed text-gray-700">
            {notification.body}
          </div>
        ) : (
          <p className="text-sm text-gray-400">本文はありません。元のページで確認してください。</p>
        )}

        {notification.originalUrl && (
          <a
            href={notification.originalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 block rounded-lg border border-[#2563EB] px-4 py-2 text-center text-sm font-medium text-[#2563EB] hover:bg-blue-50"
          >
            元のページを開く →
          </a>
        )}
      </div>
    </main>
  );
}
