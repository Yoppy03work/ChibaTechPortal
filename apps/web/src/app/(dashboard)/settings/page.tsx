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

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-4">
      <h1 className="text-lg font-bold text-[#1E3A5F]">設定</h1>
      <SettingsForm />
    </main>
  );
}
