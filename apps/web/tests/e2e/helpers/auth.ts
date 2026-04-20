/**
 * E2Eテスト用認証ヘルパー
 */
import type { Page } from '@playwright/test';

/**
 * ログインフローを実行する
 * WHY: 複数のテストファイルでログインが必要なため共通化。
 * 固定資格情報はコードに埋め込まず環境変数から取得する。
 */
export async function loginAs(
  page: Page,
  studentId = process.env.E2E_TEST_STUDENT_ID ?? '',
  password = process.env.E2E_TEST_PASSWORD ?? ''
) {
  if (!studentId || !password) {
    throw new Error('E2E_TEST_STUDENT_ID and E2E_TEST_PASSWORD must be set');
  }

  // WHY: ブラウザ側のログ/例外/失敗リクエストを CI ログに吸い上げる診断
  const logs: string[] = [];
  page.on('console', (msg) => logs.push(`[console.${msg.type()}] ${msg.text()}`));
  page.on('pageerror', (err) => logs.push(`[pageerror] ${err.message}`));
  page.on('requestfailed', (req) => logs.push(`[requestfailed] ${req.method()} ${req.url()} → ${req.failure()?.errorText}`));
  page.on('response', (resp) => {
    if (resp.url().includes('/api/auth/')) {
      logs.push(`[response] ${resp.status()} ${resp.url()}`);
    }
  });

  await page.goto('/login');
  await page.getByLabel('学籍番号').fill(studentId);
  await page.getByLabel('パスワード').fill(password);
  await page.getByRole('button', { name: 'ログイン' }).click();
  try {
    await page.waitForURL('/', { timeout: 10000 });
  } catch (err) {
    const currentUrl = page.url();
    const errorText = await page.locator('[class*="text-red"]').textContent().catch(() => null);
    // eslint-disable-next-line no-console
    console.error(`[loginAs] navigation failed: url=${currentUrl} error="${errorText}"`);
    // eslint-disable-next-line no-console
    console.error(`[loginAs] page events:\n${logs.join('\n')}`);
    throw err;
  }
}
