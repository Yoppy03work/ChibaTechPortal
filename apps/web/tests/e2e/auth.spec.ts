/**
 * E2E: 認証フロー（Auth リデザイン準拠）
 */
import { test, expect } from '@playwright/test';
import { loginAs } from './helpers/auth';
import { resetRateLimits } from './helpers/reset-rate-limit';

test.describe('認証フロー', () => {
  test.beforeEach(resetRateLimits);

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
    await expect(page.getByText('ChibaTech Portal', { exact: false }).first()).toBeVisible();
    await expect(page.getByLabel('MARINE User ID')).toBeVisible();
    await expect(page.getByLabel('パスワード')).toBeVisible();
    await expect(page.getByRole('button', { name: 'ログイン', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '新規登録' })).toBeVisible();
  });

  test('不正な学籍番号でエラーが表示される', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('MARINE User ID').fill('invalid');
    await page.getByLabel('パスワード').fill('password');
    await page.getByRole('button', { name: 'ログイン', exact: true }).click();
    // Zodバリデーションエラーが表示される
    await expect(page.getByText(/Student ID|学籍番号/i)).toBeVisible();
  });

  test('パスワードの表示/非表示を切り替えられる', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('パスワード').fill('secret');
    await expect(page.getByLabel('パスワード')).toHaveAttribute('type', 'password');
    await page.getByRole('button', { name: '表示' }).click();
    await expect(page.getByLabel('パスワード')).toHaveAttribute('type', 'text');
  });

  test('ログイン成功後ダッシュボードに遷移する', async ({ page }) => {
    await loginAs(page);
    await expect(page.getByText('今日の授業', { exact: true })).toBeVisible();
  });

  test('ログアウトするとログインページに遷移する', async ({ page }) => {
    await loginAs(page);
    await page.goto('/settings');
    await page.getByRole('button', { name: 'ログアウト' }).click();
    await expect(page).toHaveURL(/\/login/);
  });
});
