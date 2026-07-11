/**
 * E2E: 出席状況（/status）+ 手動出席
 *
 * WHY: リデザインで追加された読み取り専用の出席状況画面と、手動出席の記録
 * （POST /api/attendance/manual → AttendanceLog(method='manual')）を検証する。
 */
import { test, expect } from '@playwright/test';
import { loginAs } from './helpers/auth';
import { resetRateLimits } from './helpers/reset-rate-limit';

test.describe('出席状況', () => {
  test.beforeEach(async ({ page }) => {
    await resetRateLimits();
    await loginAs(page);
    await page.goto('/status');
  });

  test('出席率ヒーローが表示される', async ({ page }) => {
    await expect(page.getByText('全体の出席率', { exact: false }).first()).toBeVisible();
  });

  test('科目別の出席率カードが表示される（シード分）', async ({ page }) => {
    // seed-test.ts で 情報理論(3/3)・確率統計(2/3) のログを投入している
    await expect(page.getByText('情報理論', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('確率統計', { exact: true }).first()).toBeVisible();
  });

  test('手動出席カードが表示され、今日の授業があれば記録できる', async ({ page }) => {
    await expect(page.getByText('今日の出席（手動）')).toBeVisible();
    const buttons = page.getByRole('button', { name: '出席する' });
    if ((await buttons.count()) > 0) {
      await buttons.first().click();
      await expect(page.getByText('出席済み').first()).toBeVisible();
    } else {
      // WHY: 日曜はシードに授業が無い（dayOfWeek 1-6 のみ）
      await expect(page.getByText('今日の授業はありません').first()).toBeVisible();
    }
  });
});
