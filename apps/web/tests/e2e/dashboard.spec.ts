/**
 * E2E: ダッシュボード（ホーム リデザイン準拠・モバイル幅）
 *
 * WHY: E2E は Pixel 5 ビューポートで走るため、モバイルシェル（下タブ）を検証する。
 * デスクトップ用サイドバーは display:none で a11y ツリーから外れるため getByRole に露出しない。
 */
import { test, expect } from '@playwright/test';
import { loginAs } from './helpers/auth';
import { resetRateLimits } from './helpers/reset-rate-limit';

test.describe('ダッシュボード', () => {
  test.beforeEach(async ({ page }) => {
    await resetRateLimits();
    await loginAs(page);
  });

  test('統計カード（今日の授業・出席率・未読）が表示される', async ({ page }) => {
    await expect(page.getByText('今日の授業')).toBeVisible();
    await expect(page.getByText('今週の出席率')).toBeVisible();
    await expect(page.getByText('未読お知らせ')).toBeVisible();
  });

  test('次の授業ヒーローが表示される', async ({ page }) => {
    await expect(page.getByText('次の授業', { exact: false }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: '出席する' })).toBeVisible();
  });

  test('今日の時間割セクションが表示される', async ({ page }) => {
    await expect(page.getByText('今日の時間割')).toBeVisible();
  });

  test('お知らせセクションが表示される', async ({ page }) => {
    await expect(page.getByText('お知らせ', { exact: true }).first()).toBeVisible();
  });

  test('出席サマリーセクションが表示される', async ({ page }) => {
    await expect(page.getByText('出席サマリー')).toBeVisible();
  });

  test('BottomNavの5項目が表示される', async ({ page }) => {
    for (const name of ['ホーム', '時間割', '課題', 'バス', 'メニュー']) {
      await expect(page.getByRole('link', { name, exact: true })).toBeVisible();
    }
  });

  test('BottomNavから各ページに遷移できる', async ({ page }) => {
    await page.getByRole('link', { name: '時間割', exact: true }).click();
    await expect(page).toHaveURL('/timetable');

    await page.getByRole('link', { name: '課題', exact: true }).click();
    await expect(page).toHaveURL('/assignments');

    await page.getByRole('link', { name: 'バス', exact: true }).click();
    await expect(page).toHaveURL('/bus');

    await page.getByRole('link', { name: 'メニュー', exact: true }).click();
    await expect(page).toHaveURL('/menu');

    await page.getByRole('link', { name: 'ホーム', exact: true }).click();
    await expect(page).toHaveURL('/');
  });
});
