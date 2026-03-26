/**
 * manaba HTTPアダプタ
 *
 * WHY: 実測でmanabaはシンプルなPOSTログイン + サーバーサイドHTMLと判明。
 * fetch + cheerio で十分。Playwright不要。
 * Hidden: manaba-form, SessionValue1, SessionValue が必要。
 */
import type {
  ScraperAdapter,
  ScraperSession,
  ScrapedNotificationItem,
  ScrapedAssignment,
} from '@chibatech/shared';
import { ScraperLoginError, ScraperError } from '@chibatech/shared';
import { sanitizeHtml } from '@chibatech/shared';

const BASE_URL = 'https://cit.manaba.jp';
const HOME_URL = `${BASE_URL}/ct/home`;
const LOGIN_URL = `${BASE_URL}/ct/login`;

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
        cookies[pair.substring(0, eqIndex).trim()] = pair.substring(eqIndex + 1).trim();
      }
    }
  }
  return cookies;
}

function cookiesToHeader(cookies: Record<string, string>): string {
  return Object.entries(cookies)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
}

export class ManabaHttpAdapter implements ScraperAdapter {
  readonly name = 'http';
  readonly target = 'manaba' as const;

  /**
   * manabaにPOSTログインする
   *
   * フロー:
   * 1. /ct/home GET → SessionValue, SessionValue1 取得
   * 2. /ct/login POST → セッションcookies取得
   */
  async login(userId: string, password: string): Promise<ScraperSession> {
    try {
      // 1. ログインページGET → hidden field取得
      const homeResp = await fetch(HOME_URL, {
        headers: { 'User-Agent': USER_AGENT },
        redirect: 'follow',
        signal: AbortSignal.timeout(10000),
      });

      const cookies = extractCookies(homeResp.headers);
      const html = await homeResp.text();

      const { load } = await import('cheerio');
      const $ = load(html);

      const sessionValue = $('input[name="SessionValue"]').val() as string || '';
      const sessionValue1 = $('input[name="SessionValue1"]').val() as string || '';

      // 2. ログインPOST
      const loginResp = await fetch(LOGIN_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': USER_AGENT,
          Cookie: cookiesToHeader(cookies),
        },
        body: new URLSearchParams({
          userid: userId,
          password: password,
          'manaba-form': '1',
          SessionValue: sessionValue,
          SessionValue1: sessionValue1,
        }),
        redirect: 'manual',
        signal: AbortSignal.timeout(10000),
      });

      const newCookies = {
        ...cookies,
        ...extractCookies(loginResp.headers),
      };

      // WHY: ログイン失敗時はログインページにリダイレクトされる
      const location = loginResp.headers.get('location') || '';
      if (loginResp.status === 302 && (location.includes('/ct/login') || location.includes('error'))) {
        throw new ScraperLoginError(this.target, this.name);
      }

      // 200の場合もログインフォームが残っていれば失敗
      if (loginResp.status === 200) {
        const body = await loginResp.text();
        if (body.includes('name="userid"') && body.includes('name="password"')) {
          throw new ScraperLoginError(this.target, this.name);
        }
      }

      return {
        cookies: newCookies,
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
      const resp = await fetch(HOME_URL, {
        headers: {
          'User-Agent': USER_AGENT,
          Cookie: cookiesToHeader(session.cookies),
        },
        signal: AbortSignal.timeout(10000),
      });

      if (!resp.ok) {
        throw new ScraperError(`Failed to fetch: ${resp.status}`, this.target, this.name);
      }

      const html = await resp.text();
      const { load } = await import('cheerio');
      const $ = load(html);

      const notifications: ScrapedNotificationItem[] = [];

      // WHY: manabaのお知らせは .contentbody-left や .my-infolist に表示される
      $('.my-infolist-item, .infolist-item, .courselist-course').each((_, el) => {
        const $el = $(el);
        const linkEl = $el.find('a').first();
        const title = linkEl.text().trim();
        const href = linkEl.attr('href') || '';
        const dateText = $el.find('.my-infolist-date, .infolist-date').text().trim();

        if (!title) return;

        notifications.push({
          externalId: href || `manaba-${title.substring(0, 30)}`,
          title: sanitizeHtml(title),
          body: '',
          url: href.startsWith('http') ? href : `${BASE_URL}${href}`,
          publishedAt: this.parseDate(dateText),
        });
      });

      return notifications;
    } catch (error) {
      if (error instanceof ScraperError) throw error;
      throw new ScraperError('Failed to fetch manaba notifications', this.target, this.name, error);
    }
  }

  /** 課題一覧を取得する */
  async fetchAssignments(session: ScraperSession): Promise<ScrapedAssignment[]> {
    try {
      // WHY: manabaの課題一覧は /ct/home_summary_report 等から取得可能
      const resp = await fetch(`${BASE_URL}/ct/home_summary_report`, {
        headers: {
          'User-Agent': USER_AGENT,
          Cookie: cookiesToHeader(session.cookies),
        },
        signal: AbortSignal.timeout(10000),
      });

      if (!resp.ok) {
        throw new ScraperError(`Failed to fetch assignments: ${resp.status}`, this.target, this.name);
      }

      const html = await resp.text();
      const { load } = await import('cheerio');
      const $ = load(html);

      const assignments: ScrapedAssignment[] = [];

      $('.report-list-item, .stdlist tbody tr').each((_, row) => {
        const $row = $(row);
        const cells = $row.find('td');
        if (cells.length < 2) return;

        const linkEl = $row.find('a').first();
        const title = sanitizeHtml(linkEl.text().trim());
        const href = linkEl.attr('href') || '';
        const courseName = sanitizeHtml($(cells[0]).text().trim());
        const dueDateText = $row.find('.deadline, td:last-child').text().trim();

        if (!title) return;

        assignments.push({
          externalId: href || `assignment-${title.substring(0, 30)}`,
          title,
          courseName,
          dueDate: this.parseDate(dueDateText) || null,
          url: href.startsWith('http') ? href : `${BASE_URL}${href}`,
        });
      });

      return assignments;
    } catch (error) {
      if (error instanceof ScraperError) throw error;
      throw new ScraperError('Failed to fetch manaba assignments', this.target, this.name, error);
    }
  }

  /** ヘルスチェック */
  async healthCheck(): Promise<boolean> {
    try {
      const resp = await fetch(HOME_URL, {
        method: 'HEAD',
        headers: { 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(5000),
      });
      return resp.ok || resp.status === 302;
    } catch {
      return false;
    }
  }

  private parseDate(dateStr: string): Date {
    if (!dateStr) return new Date();
    const normalized = dateStr.replace(/\//g, '-').trim();
    const parsed = new Date(normalized);
    if (!isNaN(parsed.getTime())) return parsed;
    const year = new Date().getFullYear();
    const withYear = new Date(`${year}-${normalized}`);
    return isNaN(withYear.getTime()) ? new Date() : withYear;
  }
}
