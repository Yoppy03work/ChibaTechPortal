/**
 * E2E: 設定画面
 */
import { test, expect } from '@playwright/test';
import { loginAs } from './helpers/auth';

test.describe('設定', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page);
    await page.goto('/settings');
  });

  test('設定ページのタイトルが表示される', async ({ page }) => {
    await expect(page.getByRole('heading', { name: '設定' })).toBeVisible();
  });

  test('認証情報フォームが表示される', async ({ page }) => {
    await expect(page.getByText('学内システム認証情報')).toBeVisible();
    await expect(page.getByText('AES-256-GCM')).toBeVisible();
    await expect(page.getByText('CIT Portal ユーザーID')).toBeVisible();
    await expect(page.getByText('manaba ユーザーID')).toBeVisible();
    await expect(page.getByRole('button', { name: '認証情報を保存' })).toBeVisible();
  });

  test('通知設定セクションが表示される', async ({ page }) => {
    await expect(page.getByText('通知設定')).toBeVisible();
    await expect(page.getByText('Push通知')).toBeVisible();
    await expect(page.getByText('メール通知')).toBeVisible();
  });

  test('ログアウトボタンが表示される', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'ログアウト' })).toBeVisible();
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
