/**
 * 設定ページ
 *
 * WHY: CSR中心（ユーザー操作が多い）。SSR不要。
 */
import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { SettingsForm } from './settings-form';

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');

  const studentId = (session.user as { studentId?: string }).studentId || '';
  return <SettingsForm studentId={studentId} />;
}
