/**
 * E2E: 設定画面（リデザイン準拠）
 */
import { test, expect } from '@playwright/test';
import { loginAs } from './helpers/auth';
import { resetRateLimits } from './helpers/reset-rate-limit';

test.describe('設定', () => {
  test.beforeEach(async ({ page }) => {
    await resetRateLimits();
    await loginAs(page);
    await page.goto('/settings');
  });

  test('表示設定（文字サイズ・テーマ）が表示される', async ({ page }) => {
    await expect(page.getByText('文字サイズ')).toBeVisible();
    await expect(page.getByText('テーマ', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'ダーク' })).toBeVisible();
  });

  test('テーマをダークに切り替えられる', async ({ page }) => {
    await page.getByRole('button', { name: 'ダーク' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.getByRole('button', { name: 'ライト' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  });

  test('外部サービス認証フォームが表示される', async ({ page }) => {
    await expect(page.getByText('外部サービス認証')).toBeVisible();
    await expect(page.getByText('AES-256-GCM', { exact: false })).toBeVisible();
    await expect(page.getByText(/CIT Portal ID/)).toBeVisible();
    await expect(page.getByText(/manaba ID/)).toBeVisible();
    await expect(page.getByRole('button', { name: '認証情報を保存' })).toBeVisible();
  });

  test('通知設定セクションが表示される', async ({ page }) => {
    await expect(page.getByText('プッシュ通知', { exact: true })).toBeVisible();
    await expect(page.getByText('メール転送', { exact: true })).toBeVisible();
  });

  test('認証情報を入力できる', async ({ page }) => {
    const citUserIdInput = page.locator('input[placeholder="ユーザーID"]').first();
    await citUserIdInput.fill('M24G1140');
    await expect(citUserIdInput).toHaveValue('M24G1140');
  });

  test('ログアウトボタンをクリックするとログインページに遷移する', async ({ page }) => {
    await page.getByRole('button', { name: 'ログアウト' }).click();
    await expect(page).toHaveURL(/\/login/);
  });
});
