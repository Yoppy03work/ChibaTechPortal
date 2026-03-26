/**
 * ログインページ
 *
 * WHY: Server Componentとして描画し、フォームのインタラクションは
 * LoginForm Client Componentに委譲する。
 */
import { LoginForm } from './login-form';

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-[#1E3A5F]">
            <span className="text-[#60A5FA]">CTP</span> ChibaTech
            <span className="text-[#2563EB]">Portal</span>
          </h1>
          <p className="mt-2 text-sm text-gray-500">
            千葉工業大学 統合ポータル
          </p>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}
