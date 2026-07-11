/**
 * E2E: 時間割（週表示グリッド リデザイン準拠）
 *
 * WHY: リデザイン後は閲覧専用の週間グリッド（フェーズ1はモック）。
 * 旧UIの編集モーダル（追加/保存）は廃止されたためテストも表示検証に置き換える。
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

  test('時間割ページのヘッダーが表示される', async ({ page }) => {
    // WHY: hidden のデスクトップトップバーにも同じ副題があるため先頭（モバイルヘッダー）に限定
    await expect(page.getByText('2026年度 前期').first()).toBeVisible();
  });

  test('曜日ヘッダー（月〜土）が表示される', async ({ page }) => {
    for (const day of ['月', '火', '水', '木', '金', '土']) {
      await expect(page.getByText(day, { exact: true })).toBeVisible();
    }
  });

  test('時限（1〜5）が表示される', async ({ page }) => {
    for (const period of ['1', '2', '3', '4', '5']) {
      await expect(page.getByText(period, { exact: true }).first()).toBeVisible();
    }
  });

  test('授業セルが表示される', async ({ page }) => {
    await expect(page.getByText('情報理論').first()).toBeVisible();
    await expect(page.getByText('確率統計').first()).toBeVisible();
  });

  test('凡例が表示される', async ({ page }) => {
    // WHY: 実データにはカテゴリが無いため凡例は「現在の授業」のみ
    await expect(page.getByText('現在の授業')).toBeVisible();
  });
});
