/**
 * 課題・提出物 — 設計 isAssign 画面・実データ版。
 *
 * WHY: Server Component で Assignment を取得し、フィルタUIはクライアント
 * (assignments-list) に委譲。状態は期限から導出（期限切れ/未提出(48h以内=強調)/提出済）。
 */
import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { getAssignments } from '@/lib/portal-data';
import { AssignmentsList } from './assignments-list';

export const dynamic = 'force-dynamic';

export default async function AssignmentsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');

  const rows = await getAssignments(session.user.id);
  return <AssignmentsList rows={rows} />;
}
