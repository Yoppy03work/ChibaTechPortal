/**
 * E2E: 時間割管理
 */
import { test, expect } from '@playwright/test';
import { loginAs } from './helpers/auth';
import { resetRateLimits } from './helpers/reset-rate-limit';

test.describe('時間割', () => {
  test.beforeEach(async ({ page }) => {
    await resetRateLimits();
    await loginAs(page);
    await page.goto('/timetable');
  });

  test('時間割ページのタイトルが表示される', async ({ page }) => {
    await expect(page.getByText('時間割')).toBeVisible();
  });

  test('曜日ヘッダー（月〜土）が表示される', async ({ page }) => {
    for (const day of ['月', '火', '水', '木', '金', '土']) {
      await expect(page.getByText(day, { exact: true })).toBeVisible();
    }
  });

  test('時限（1〜6）が表示される', async ({ page }) => {
    for (const period of ['1', '2', '3', '4', '5', '6']) {
      await expect(page.getByText(period, { exact: true }).first()).toBeVisible();
    }
  });

  test('セルをクリックすると編集モーダルが表示される', async ({ page }) => {
    // 月曜1限のセルをクリック
    const cells = page.locator('td.cursor-pointer');
    await cells.first().click();

    // モーダルが表示される
    await expect(page.getByText('授業名')).toBeVisible();
    await expect(page.getByText('教室')).toBeVisible();
    await expect(page.getByRole('button', { name: '保存' })).toBeVisible();
    await expect(page.getByRole('button', { name: '閉じる' })).toBeVisible();
  });

  test('授業を追加できる', async ({ page }) => {
    const cells = page.locator('td.cursor-pointer');
    await cells.first().click();

    await page.getByPlaceholder('プログラミングII').fill('数学基礎');
    await page.getByPlaceholder('8109').fill('7201');
    await page.getByRole('button', { name: '保存' }).click();

    // モーダルが閉じてグリッドに反映
    await expect(page.getByText('数学基礎')).toBeVisible();
    await expect(page.getByText('7201')).toBeVisible();
  });

  test('モーダルを閉じるボタンで閉じられる', async ({ page }) => {
    const cells = page.locator('td.cursor-pointer');
    await cells.first().click();
    await expect(page.getByText('授業名')).toBeVisible();

    await page.getByRole('button', { name: '閉じる' }).click();
    await expect(page.getByText('授業名')).not.toBeVisible();
  });
});
