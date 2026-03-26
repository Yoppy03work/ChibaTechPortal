/**
 * E2Eテスト用認証ヘルパー
 */
import type { Page } from '@playwright/test';

/**
 * ログインフローを実行する
 * WHY: 複数のテストファイルでログインが必要なため共通化
 */
export async function loginAs(
  page: Page,
  studentId = 'M24G1140',
  password = 'TestPassword123!'
) {
  await page.goto('/login');
  await page.getByLabel('学籍番号').fill(studentId);
  await page.getByLabel('パスワード').fill(password);
  await page.getByRole('button', { name: 'ログイン' }).click();
  // ダッシュボードに遷移するまで待機
  await page.waitForURL('/', { timeout: 10000 });
}
