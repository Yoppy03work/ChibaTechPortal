/**
 * スクレイパーセキュリティモジュール
 *
 * WHY: スクレイピング結果のサニタイズ、認証情報の漏洩防止、
 * リダイレクト制御など、スクレイパー固有のセキュリティ機能を提供する。
 */
import { sanitizeHtml } from './validation';

export interface ScrapedNotification {
  title: string;
  body: string;
  source: string;
  originalUrl: string;
  publishedAt: string;
}

/**
 * スクレイピング結果をサニタイズする
 * WHY: 外部HTMLから取得したデータにXSSペイロードが含まれる可能性があるため、
 * DBに保存・表示する前に必ずサニタイズする
 */
export function sanitizeScrapedData(notification: ScrapedNotification): ScrapedNotification {
  return {
    title: sanitizeHtml(notification.title),
    body: sanitizeHtml(notification.body),
    source: notification.source,
    originalUrl: notification.originalUrl,
    publishedAt: notification.publishedAt,
  };
}

/**
 * エラーメッセージから認証情報を除去する
 * WHY: エラーログやユーザー向けメッセージにパスワード・トークンが含まれるのを防ぐ
 */
export function sanitizeErrorMessage(error: Error, sensitiveValues: string[]): string {
  let message = error.message;
  for (const value of sensitiveValues) {
    if (value.length > 0) {
      message = message.replaceAll(value, '[REDACTED]');
    }
  }
  if (error.stack) {
    for (const value of sensitiveValues) {
      if (value.length > 0) {
        error.stack = error.stack.replaceAll(value, '[REDACTED]');
      }
    }
  }
  return message;
}

/** リダイレクトの最大回数 */
export const MAX_REDIRECTS = 10;

/**
 * リダイレクトループを検出するトラッカー
 */
export class RedirectTracker {
  private visitedUrls = new Set<string>();
  private count = 0;

  /**
   * URLを記録し、ループまたは上限超過をチェックする
   * @throws リダイレクトループまたは上限超過の場合
   */
  track(url: string): void {
    if (this.visitedUrls.has(url)) {
      throw new Error(`Redirect loop detected: ${url}`);
    }
    this.count++;
    if (this.count > MAX_REDIRECTS) {
      throw new Error(`Too many redirects (${this.count} > ${MAX_REDIRECTS})`);
    }
    this.visitedUrls.add(url);
  }
}

/** セッションCookieの推奨設定 */
export const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: 'strict' as const,
  path: '/',
  maxAge: 15 * 60, // 15分
} as const;
