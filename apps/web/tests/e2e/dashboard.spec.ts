/**
 * E2E: ダッシュボード
 */
import { test, expect } from '@playwright/test';
import { loginAs } from './helpers/auth';

test.describe('ダッシュボード', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page);
  });

  test('ヘッダーにCTP Dashboardと学籍番号が表示される', async ({ page }) => {
    await expect(page.getByText('CTP')).toBeVisible();
    await expect(page.getByText('Dashboard')).toBeVisible();
  });

  test('次の授業カードが表示される', async ({ page }) => {
    await expect(page.getByText('次の授業')).toBeVisible();
  });

  test('今日の時間割セクションが表示される', async ({ page }) => {
    await expect(page.getByText('今日の時間割')).toBeVisible();
  });

  test('最新のお知らせセクションが表示される', async ({ page }) => {
    await expect(page.getByText('最新のお知らせ')).toBeVisible();
  });

  test('締切が近い課題セクションが表示される', async ({ page }) => {
    await expect(page.getByText('締切が近い課題')).toBeVisible();
  });

  test('BottomNavの5項目が表示される', async ({ page }) => {
    await expect(page.getByRole('link', { name: 'ホーム' })).toBeVisible();
    await expect(page.getByRole('link', { name: '時間割' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'お知らせ' })).toBeVisible();
    await expect(page.getByRole('link', { name: '出席' })).toBeVisible();
    await expect(page.getByRole('link', { name: '設定' })).toBeVisible();
  });

  test('BottomNavから各ページに遷移できる', async ({ page }) => {
    await page.getByRole('link', { name: '時間割' }).click();
    await expect(page).toHaveURL('/timetable');

    await page.getByRole('link', { name: 'お知らせ' }).click();
    await expect(page).toHaveURL('/notifications');

    await page.getByRole('link', { name: '出席' }).click();
    await expect(page).toHaveURL('/attendance');

    await page.getByRole('link', { name: '設定' }).click();
    await expect(page).toHaveURL('/settings');

    await page.getByRole('link', { name: 'ホーム' }).click();
    await expect(page).toHaveURL('/');
  });
});
