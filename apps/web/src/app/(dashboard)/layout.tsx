/**
 * ダッシュボードレイアウト（認証必須）
 *
 * WHY: (dashboard) Route Groupの共通レイアウト。
 * 認証チェックはmiddlewareで行うため、ここではUI共通部分のみ。
 */
import { BottomNav } from '@/components/bottom-nav';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="pb-16">
      {children}
      <BottomNav />
    </div>
  );
}
