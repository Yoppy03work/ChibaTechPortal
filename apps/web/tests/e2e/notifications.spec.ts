/**
 * E2E: お知らせ（ソース集約 リデザイン準拠）
 *
 * WHY: リデザイン後はソース別（CIT Portal / manaba / メール）のクライアントフィルタ。
 * フェーズ1はモックデータ表示のため、モック項目の可視/絞り込みを検証する。
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

  test('お知らせページのヘッダーが表示される', async ({ page }) => {
    // WHY: hidden のデスクトップトップバーにも同じ副題があるため先頭（モバイルヘッダー）に限定
    await expect(page.getByText('CIT Portal・manaba・メール を集約').first()).toBeVisible();
  });

  test('ソース別フィルタが表示される', async ({ page }) => {
    await expect(page.getByRole('button', { name: /すべて/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /CIT Portal/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /manaba/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /メール/ })).toBeVisible();
  });

  test('お知らせカードが表示される', async ({ page }) => {
    await expect(page.getByText('前期末試験の時間割を公開しました')).toBeVisible();
  });

  test('manabaフィルタで manaba のお知らせだけに絞り込まれる', async ({ page }) => {
    await page.getByRole('button', { name: /manaba/ }).click();
    // manaba のお知らせは表示される
    await expect(page.getByText('情報理論：第9回 講義資料をアップロードしました')).toBeVisible();
    // CIT Portal のお知らせは消える
    await expect(page.getByText('前期末試験の時間割を公開しました')).not.toBeVisible();
  });

  test('メールフィルタで メール由来のお知らせだけに絞り込まれる', async ({ page }) => {
    await page.getByRole('button', { name: /メール/ }).click();
    await expect(page.getByText('【大学メール】履修登録エラーのお知らせ')).toBeVisible();
    await expect(page.getByText('前期末試験の時間割を公開しました')).not.toBeVisible();
  });
});
