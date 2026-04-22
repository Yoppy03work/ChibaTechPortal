/**
 * E2Eテスト用認証ヘルパー
 */
import type { Page } from '@playwright/test';

/**
 * ログインフローを実行する
 * WHY: 複数のテストファイルでログインが必要なため共通化。
 * 固定資格情報はコードに埋め込まず環境変数から取得する。
 */
export async function loginAs(
  page: Page,
  studentId = process.env.E2E_TEST_STUDENT_ID ?? '',
  password = process.env.E2E_TEST_PASSWORD ?? ''
) {
  if (!studentId || !password) {
    throw new Error('E2E_TEST_STUDENT_ID and E2E_TEST_PASSWORD must be set');
  }

  await page.goto('/login');
  await page.getByLabel('学籍番号').fill(studentId);
  await page.getByLabel('パスワード').fill(password);
  await page.getByRole('button', { name: 'ログイン' }).click();
  // WHY: window.location.href='/' でダッシュボードに遷移するまで待つ
  await page.waitForURL('/', { timeout: 10000 });
}
