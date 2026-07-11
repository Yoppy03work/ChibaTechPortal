/**
 * ダッシュボードレイアウト（認証必須）＝ レスポンシブ・アプリシェル。
 *
 * WHY: middleware だけに依存すると認証が外れるリスクがあるため、レイアウト層でも
 * サーバー側で再確認する（多層防御）。UI は幅で切替：
 *   - モバイル(App): sticky ヘッダー + 固定ボトムナビ + 細いカラム
 *   - デスクトップ(Web): 左サイドバー + 上部バー + 広い本文
 * 両シェルを DOM に置き globals.css の @media で出し分ける（SSR安全・FOUCなし）。
 */
import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { BottomNav } from '@/components/bottom-nav';
import { AppHeader } from '@/components/app-header';
import { Sidebar } from '@/components/sidebar';
import { DesktopTopbar } from '@/components/desktop-topbar';

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
    <div className="ctp-shell">
      <Sidebar />
      <div className="ctp-main">
        <AppHeader />
        <DesktopTopbar />
        <main className="ctp-content ctp-scroll">{children}</main>
      </div>
      <BottomNav />
    </div>
  );
}
