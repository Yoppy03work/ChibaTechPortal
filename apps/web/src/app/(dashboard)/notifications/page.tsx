/**
 * お知らせ — 設計 isNews 画面・実データ版（ソース集約）。
 *
 * WHY: Server Component で Notification を取得し、フィルタUIはクライアント
 * (notifications-list) に委譲。ソースは CIT Portal / manaba（メールは将来の収集用に
 * チップだけ用意し、0件の空状態を表示）。
 */
import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { getNotifications } from '@/lib/portal-data';
import { NotificationsList } from './notifications-list';

export const dynamic = 'force-dynamic';

export default async function NotificationsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');

  const rows = await getNotifications(session.user.id, 50);
  return <NotificationsList rows={rows} />;
}
