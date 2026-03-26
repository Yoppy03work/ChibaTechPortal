/**
 * E2E: 認証フロー
 */
import { test, expect } from '@playwright/test';
import { loginAs } from './helpers/auth';

test.describe('認証フロー', () => {
  test('未認証でダッシュボードにアクセスするとログインページにリダイレクトされる', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/login/);
  });

  test('未認証で時間割にアクセスするとログインページにリダイレクトされる', async ({ page }) => {
    await page.goto('/timetable');
    await expect(page).toHaveURL(/\/login/);
  });

  test('ログインページが正しく表示される', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByText('ChibaTechPortal', { exact: false })).toBeVisible();
    await expect(page.getByLabel('学籍番号')).toBeVisible();
    await expect(page.getByLabel('パスワード')).toBeVisible();
    await expect(page.getByRole('button', { name: 'ログイン' })).toBeVisible();
  });

  test('不正な学籍番号でエラーが表示される', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('学籍番号').fill('invalid');
    await page.getByLabel('パスワード').fill('password');
    await page.getByRole('button', { name: 'ログイン' }).click();
    // Zodバリデーションエラーが表示される
    await expect(page.getByText(/Student ID|学籍番号/i)).toBeVisible();
  });

  test('ログイン成功後ダッシュボードに遷移する', async ({ page }) => {
    await loginAs(page);
    await expect(page.getByText('Dashboard')).toBeVisible();
  });

  test('ログアウトするとログインページに遷移する', async ({ page }) => {
    await loginAs(page);
    await page.goto('/settings');
    await page.getByRole('button', { name: 'ログアウト' }).click();
    await expect(page).toHaveURL(/\/login/);
  });
});
