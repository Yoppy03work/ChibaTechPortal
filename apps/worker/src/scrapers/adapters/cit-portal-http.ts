/**
 * CIT Portal HTTPアダプタ
 *
 * WHY: 実測でCIT Portal(UPRX)はJSFベースのサーバーサイドレンダリングと判明。
 * fetch + cheerioでアクセス可能。ただしJSF ViewStateの管理が必要。
 * SSOではなくフォームPOSTで認証する。
 */
import type {
  ScraperAdapter,
  ScraperSession,
  ScrapedNotificationItem,
} from '@chibatech/shared';
import { ScraperLoginError, ScraperError } from '@chibatech/shared';
import { sanitizeHtml } from '@chibatech/shared';

const BASE_URL = 'https://portal.it-chiba.ac.jp/uprx';
const LOGIN_PAGE_URL = `${BASE_URL}/up/pk/pky001/Pky00101.xhtml`;
const NOTIFICATIONS_URL = `${BASE_URL}/up/pk/pky501/Pky50101.xhtml`;

// WHY: 定期メンテ AM2:00〜5:00 を考慮
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

/** Set-Cookieヘッダーからcookieを抽出する */
function extractCookies(headers: Headers): Record<string, string> {
  const cookies: Record<string, string> = {};
  const setCookies = headers.getSetCookie?.() ?? [];
  for (const sc of setCookies) {
    const [pair] = sc.split(';');
    if (pair) {
      const eqIndex = pair.indexOf('=');
      if (eqIndex > 0) {
        const name = pair.substring(0, eqIndex).trim();
        const value = pair.substring(eqIndex + 1).trim();
        cookies[name] = value;
      }
    }
  }
  return cookies;
}

/** cookieオブジェクトをヘッダー文字列に変換する */
function cookiesToHeader(cookies: Record<string, string>): string {
  return Object.entries(cookies)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
}

export class CitPortalHttpAdapter implements ScraperAdapter {
  readonly name = 'http';
  readonly target = 'cit-portal' as const;

  /**
   * CIT PortalにフォームPOSTでログインする
   *
   * フロー:
   * 1. ログインページGET → ViewState + cookies取得
   * 2. ログインPOST（ViewState必須）→ セッションcookies取得
   */
  async login(userId: string, password: string): Promise<ScraperSession> {
    try {
      // 1. ログインページ取得 → ViewState抽出
      const loginPageResp = await fetch(LOGIN_PAGE_URL, {
        headers: { 'User-Agent': USER_AGENT },
        redirect: 'follow',
        signal: AbortSignal.timeout(10000),
      });

      if (!loginPageResp.ok) {
        throw new ScraperLoginError(this.target, this.name);
      }

      const cookies = extractCookies(loginPageResp.headers);
      const html = await loginPageResp.text();

      // WHY: cheerioは動的importで遅延ロード（Workerの起動時間を短縮）
      const { load } = await import('cheerio');
      const $ = load(html);

      // WHY: JSFはViewStateなしのPOSTを拒否するため必須
      const viewState = $('input[name="javax.faces.ViewState"]').val() as string;
      if (!viewState) {
        throw new ScraperLoginError(this.target, this.name, 'ViewState not found');
      }

      // 2. ログインPOST
      const loginResp = await fetch(LOGIN_PAGE_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': USER_AGENT,
          Cookie: cookiesToHeader(cookies),
        },
        body: new URLSearchParams({
          loginForm: 'loginForm',
          'loginForm:userId': userId,
          'loginForm:password': password,
          'javax.faces.ViewState': viewState,
        }),
        redirect: 'manual',
        signal: AbortSignal.timeout(10000),
      });

      // ログイン成功: 302リダイレクト or 200
      const newCookies = {
        ...cookies,
        ...extractCookies(loginResp.headers),
      };

      // WHY: ログイン失敗の検出。JSFはエラー時も200を返すことがある
      if (loginResp.status === 200) {
        const body = await loginResp.text();
        if (body.includes('errForm') || body.includes('ログインID') || body.includes('パスワード')) {
          throw new ScraperLoginError(this.target, this.name);
        }
      }

      return {
        cookies: newCookies,
        // WHY: CIT Portalのセッションタイムアウトは不明なため、保守的に30分
        expiresAt: Date.now() + 30 * 60 * 1000,
      };
    } catch (error) {
      if (error instanceof ScraperLoginError) throw error;
      throw new ScraperLoginError(this.target, this.name, error);
    }
  }

  /** お知らせ一覧を取得する */
  async fetchNotifications(session: ScraperSession): Promise<ScrapedNotificationItem[]> {
    try {
      const resp = await fetch(NOTIFICATIONS_URL, {
        headers: {
          'User-Agent': USER_AGENT,
          Cookie: cookiesToHeader(session.cookies),
        },
        signal: AbortSignal.timeout(10000),
      });

      if (!resp.ok) {
        throw new ScraperError(
          `Failed to fetch notifications: ${resp.status}`,
          this.target,
          this.name
        );
      }

      const html = await resp.text();
      const { load } = await import('cheerio');
      const $ = load(html);

      const notifications: ScrapedNotificationItem[] = [];

      // WHY: CIT Portal(UPRX)のHTML構造に依存。構造変更時はここを修正
      // JSFのdata tableからお知らせを抽出
      $('table.infoTable tbody tr, table[id*="info"] tbody tr').each((_, row) => {
        const $row = $(row);
        const cells = $row.find('td');
        if (cells.length < 2) return;

        const dateText = $(cells[0]).text().trim();
        const titleEl = $(cells[1]).find('a').first();
        const title = titleEl.text().trim() || $(cells[1]).text().trim();
        const href = titleEl.attr('href') || '';

        if (!title) return;

        notifications.push({
          externalId: href || `cit-${dateText}-${title.substring(0, 20)}`,
          // WHY: 外部HTMLはサニタイズしてからDBに保存
          title: sanitizeHtml(title),
          body: '', // 詳細は個別ページから取得（Phase 2）
          url: href.startsWith('http') ? href : `${BASE_URL}${href}`,
          publishedAt: this.parseDate(dateText),
        });
      });

      return notifications;
    } catch (error) {
      if (error instanceof ScraperError) throw error;
      throw new ScraperError(
        'Failed to fetch CIT Portal notifications',
        this.target,
        this.name,
        error
      );
    }
  }

  /** ヘルスチェック: ログインページにアクセスできるか */
  async healthCheck(): Promise<boolean> {
    try {
      const resp = await fetch(LOGIN_PAGE_URL, {
        method: 'HEAD',
        headers: { 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(5000),
      });
      return resp.ok || resp.status === 302;
    } catch {
      return false;
    }
  }

  /** 日付文字列をDateに変換する */
  private parseDate(dateStr: string): Date {
    // "2026/03/21" or "2026-03-21" or "03/21"
    const normalized = dateStr.replace(/\//g, '-');
    const parsed = new Date(normalized);
    if (!isNaN(parsed.getTime())) return parsed;
    // "MM/DD" 形式の場合は今年を補完
    const year = new Date().getFullYear();
    const withYear = new Date(`${year}-${normalized}`);
    return isNaN(withYear.getTime()) ? new Date() : withYear;
  }
}
