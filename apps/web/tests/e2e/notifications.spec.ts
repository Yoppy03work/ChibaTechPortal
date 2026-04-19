/**
 * E2E: お知らせ
 */
import { test, expect } from '@playwright/test';
import { loginAs } from './helpers/auth';
import { resetRateLimits } from './helpers/reset-rate-limit';

test.describe('お知らせ', () => {
  test.beforeEach(async ({ page }) => {
    await resetRateLimits();
    await loginAs(page);
    await page.goto('/notifications');
  });

  test('お知らせページのタイトルが表示される', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'お知らせ' })).toBeVisible();
  });

  test('フィルタボタンが表示される', async ({ page }) => {
    await expect(page.getByRole('link', { name: '全て' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'CIT Portal' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'manaba' })).toBeVisible();
    await expect(page.getByRole('link', { name: '未読のみ' })).toBeVisible();
  });

  test('CIT PortalフィルタをクリックするとURLが変わる', async ({ page }) => {
    await page.getByRole('link', { name: 'CIT Portal' }).click();
    await expect(page).toHaveURL(/source=cit-portal/);
  });

  test('manabaフィルタをクリックするとURLが変わる', async ({ page }) => {
    await page.getByRole('link', { name: 'manaba' }).click();
    await expect(page).toHaveURL(/source=manaba/);
  });

  test('お知らせがない場合にメッセージが表示される', async ({ page }) => {
    await expect(page.getByText('お知らせはありません')).toBeVisible();
  });
});
