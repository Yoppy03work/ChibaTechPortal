'use client';

/**
 * ログインフォーム（Client Component）
 *
 * WHY: signIn はクライアントサイドで実行する必要があるため "use client"。
 * Zodスキーマでクライアント側バリデーションも行い、不正な入力をサーバーに送らない。
 */
import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { loginSchema } from '@chibatech/shared';

export function LoginForm() {
  const [studentId, setStudentId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    // WHY: クライアント側でもZodバリデーションし、不正な入力を早期にブロック
    const parsed = loginSchema.safeParse({ studentId, password });
    if (!parsed.success) {
      setError(parsed.error.errors[0]?.message || 'Invalid input');
      return;
    }

    setLoading(true);
    try {
      const result = await signIn('credentials', {
        studentId: parsed.data.studentId,
        password: parsed.data.password,
        redirect: false,
      });

      if (result?.error) {
        setError('学籍番号またはパスワードが正しくありません');
      } else {
        window.location.href = '/';
      }
    } catch {
      setError('ログインに失敗しました。もう一度お試しください。');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">
          {error}
        </div>
      )}

      <div>
        <label htmlFor="studentId" className="block text-sm font-medium text-gray-700">
          学籍番号
        </label>
        <input
          id="studentId"
          type="text"
          pattern="[A-Z]\d{2}[A-Z]\d{4}"
          maxLength={8}
          required
          value={studentId}
          onChange={(e) => setStudentId(e.target.value.toUpperCase())}
          placeholder="M24G1140"
          className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#2563EB] focus:outline-none focus:ring-1 focus:ring-[#2563EB]"
        />
      </div>

      <div>
        <label htmlFor="password" className="block text-sm font-medium text-gray-700">
          パスワード
        </label>
        <input
          id="password"
          type="password"
          required
          minLength={1}
          maxLength={128}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#2563EB] focus:outline-none focus:ring-1 focus:ring-[#2563EB]"
        />
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-lg bg-[#2563EB] px-4 py-2 text-sm font-medium text-white hover:bg-[#1E3A5F] disabled:opacity-50"
      >
        {loading ? 'ログイン中...' : 'ログイン'}
      </button>
    </form>
  );
}
