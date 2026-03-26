/**
 * ダッシュボードレイアウト（認証必須）
 *
 * WHY: middleware だけに依存すると、matcher変更や設定ミスで認証が外れるリスクがある。
 * レイアウト層でもサーバー側認証チェックを行い、多層防御を実現する。
 */
import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { BottomNav } from '@/components/bottom-nav';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // WHY: middlewareとは別にサーバー側で再確認（多層防御）
  const session = await auth();
  if (!session?.user?.id) {
    redirect('/login');
  }

  return (
    <div className="pb-16">
      {children}
      <BottomNav />
    </div>
  );
}
