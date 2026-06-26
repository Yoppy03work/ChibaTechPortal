/**
 * 出席システム HTTPアダプタ
 *
 * WHY: 2026-06-26 CIT 内部網での実機検証で確定した本物のフロー。
 *   ① POST /attendance/login  (_csrf+username+password、**Referer/Origin 必須**・keeplogin 送らない)
 *      → 302 /attendance/top。Referer/Origin 無し or keeplogin=on だと 200 でログイン画面に
 *        再描画され無音失敗するため、ヘッダを必ず付ける。
 *   ② GET  /attendance/class_room/{roomId} → 出席確認画面 (その教室の現授業)
 *   ③ POST /attendance/attend (_csrf のみ) → 「出席済みにしました」
 *
 * ホスト: TLS 証明書は `attendance.is.it-chiba.ac.jp` 用 (旧ドメイン)。新ドメイン
 *   `chibatech.ac.jp` は同一サーバ(10.64.40.1)だが cert altname 不一致で Node fetch が
 *   ERR_TLS_CERT_ALTNAME_INVALID で失敗するため、既定は it-chiba を使う。
 * creds: ポータル SSO と同じ学籍番号+パスワード (出席システムは SSO でなくローカルフォーム)。
 *
 * 状態判定は always-present なモーダルテンプレ (completeModal/errorModal) ではなく、
 * 状態依存のテキスト (「出席済みにしました」「出席で登録する」「出席できる授業はありません」)
 * で行う (実機検証済み)。
 */
import * as cheerio from 'cheerio';
import type { AttendanceResult, AttendanceAdapter } from '@chibatech/shared';
import { ScraperLoginError, ScraperError } from '@chibatech/shared';

// WHY: 既定は本番 CIT 出席システム (cert 有効な it-chiba ホスト)。ローカル検証で stub へ
// 向けたい場合のみ ATTENDANCE_BASE_URL で上書きする (production は未設定 → 既定のまま)。
const BASE_URL =
  process.env.ATTENDANCE_BASE_URL ?? 'https://attendance.is.it-chiba.ac.jp';
const ORIGIN = (() => {
  try {
    return new URL(BASE_URL).origin;
  } catch {
    return BASE_URL;
  }
})();
const LOGIN_URL = `${BASE_URL}/attendance/login`;
const ATTEND_URL = `${BASE_URL}/attendance/attend`;
const classRoomUrl = (roomId: string) =>
  `${BASE_URL}/attendance/class_room/${encodeURIComponent(roomId)}`;

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';
const TIMEOUT_MS = 10000;

function extractCookies(headers: Headers): Record<string, string> {
  const cookies: Record<string, string> = {};
  const setCookies = headers.getSetCookie?.() ?? [];
  for (const sc of setCookies) {
    const [pair] = sc.split(';');
    if (pair) {
      const eq = pair.indexOf('=');
      if (eq > 0) {
        cookies[pair.substring(0, eq).trim()] = pair.substring(eq + 1).trim();
      }
    }
  }
  return cookies;
}

function cookieHeader(cookies: Record<string, string>): string {
  return Object.entries(cookies)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
}

/**
 * _csrf を取り出す。formActionContains を指定すると、その action を持つフォーム内の
 * _csrf を優先する (class_room ページには logout と attend の 2 フォームがあり、
 * ページ全体の最初の _csrf だと logout 側を拾い得るため)。
 */
function extractCsrf(html: string, formActionContains?: string): string | null {
  const $ = cheerio.load(html);
  if (formActionContains) {
    const $form = $('form')
      .filter((_, f) => ($(f).attr('action') || '').includes(formActionContains))
      .first();
    const scoped = $form.find('input[name="_csrf"]').attr('value');
    if (scoped) return scoped;
  }
  return $('input[name="_csrf"]').first().attr('value') ?? null;
}

/** モーダル/alert から実エラーメッセージを抽出 (テンプレ既定値しか無ければ null)。 */
function extractErrorMessage(html: string): string | null {
  const $ = cheerio.load(html);
  for (const sel of ['#errorModal .modal-body', '#errorModal', '.alert-danger', '.alert']) {
    const t = $(sel).text().replace(/\s+/g, ' ').trim();
    if (t && t.length <= 200) return t;
  }
  return null;
}

export class AttendanceHttpAdapter implements AttendanceAdapter {
  readonly name = 'http';

  /** ログイン → class_room → attend のフルフローで出席する。 */
  async attend(
    userId: string,
    password: string,
    roomId: string,
  ): Promise<AttendanceResult> {
    try {
      const cookies = await this.login(userId, password);
      return await this.attendInSession(cookies, roomId);
    } catch (error) {
      if (error instanceof ScraperError) throw error;
      throw new ScraperError('Attendance failed', 'attendance', this.name, error);
    }
  }

  /** 既存セッション cookie で出席する (再ログイン省略)。期限切れなら ScraperError。 */
  async attendWithSession(
    cookies: Record<string, string>,
    roomId: string,
  ): Promise<AttendanceResult> {
    try {
      return await this.attendInSession({ ...cookies }, roomId);
    } catch (error) {
      if (error instanceof ScraperError) throw error;
      throw new ScraperError(
        'Attendance with session failed',
        'attendance',
        this.name,
        error,
      );
    }
  }

  /** 出席システム到達性チェック。 */
  async healthCheck(): Promise<boolean> {
    try {
      const resp = await fetch(`${BASE_URL}/attendance/`, {
        method: 'HEAD',
        headers: { 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(5000),
      });
      return resp.ok || resp.status === 302;
    } catch {
      return false;
    }
  }

  /**
   * ローカルフォームでログインしてセッション cookie を返す。
   * 成功は 302 → /top。失敗 (creds 不正/ヘッダ不足) は 200 でログイン画面に再描画される
   * (または 302 → /login) ので、いずれも ScraperLoginError にする。
   */
  private async login(
    userId: string,
    password: string,
  ): Promise<Record<string, string>> {
    let cookies: Record<string, string> = {};

    const getResp = await fetch(LOGIN_URL, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'text/html' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    cookies = { ...cookies, ...extractCookies(getResp.headers) };
    const csrf = extractCsrf(await getResp.text());
    if (!csrf) {
      throw new ScraperLoginError('attendance', this.name, 'CSRF token not found');
    }

    const postResp = await fetch(LOGIN_URL, {
      method: 'POST',
      redirect: 'manual',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': USER_AGENT,
        // WHY: Referer/Origin が無いと出席システムは 200 でログイン画面に戻し無音失敗する。
        Origin: ORIGIN,
        Referer: LOGIN_URL,
        Cookie: cookieHeader(cookies),
      },
      // WHY: keeplogin は送らない (送ると検証時に認証が通らなかった)。
      body: new URLSearchParams({ _csrf: csrf, username: userId, password }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    cookies = { ...cookies, ...extractCookies(postResp.headers) };

    const location = postResp.headers.get('location') || '';
    if (postResp.status !== 302 || location.includes('/login')) {
      // 200 再描画 or /login へのリダイレクト = 認証失敗。
      throw new ScraperLoginError('attendance', this.name);
    }
    return cookies;
  }

  /**
   * セッション cookie で class_room → /attendance/attend を実行する。
   */
  private async attendInSession(
    cookies: Record<string, string>,
    roomId: string,
  ): Promise<AttendanceResult> {
    const crUrl = classRoomUrl(roomId);
    const cr = await fetch(crUrl, {
      redirect: 'follow',
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html',
        Cookie: cookieHeader(cookies),
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    Object.assign(cookies, extractCookies(cr.headers));
    const finalUrl = cr.url || crUrl;
    if (finalUrl.includes('/login')) {
      throw new ScraperError('Session expired', 'attendance', this.name);
    }
    const html = await cr.text();

    // 既に出席済み
    if (html.includes('出席済みにしました')) {
      return { success: true, message: '出席済み', classDate: new Date() };
    }
    // 出席可能な授業なし
    if (html.includes('出席できる授業はありません')) {
      return {
        success: false,
        message: '現在、出席できる授業はありません',
        classDate: new Date(),
      };
    }
    // 出席確認画面 (登録ボタンあり) → /attendance/attend へ submit
    const hasAttendForm = /action="[^"]*\/attendance\/attend/.test(html);
    if (html.includes('出席で登録する') && hasAttendForm) {
      const csrf = extractCsrf(html, '/attendance/attend');
      if (!csrf) {
        return {
          success: false,
          message: '出席フォームの CSRF を取得できませんでした',
          classDate: new Date(),
        };
      }
      return await this.submitAttend(cookies, csrf, finalUrl);
    }

    // 想定外: エラーメッセージがあればそれを、無ければ判定不能
    const err = extractErrorMessage(html);
    return {
      success: false,
      message: err || '出席状態を判定できませんでした',
      classDate: new Date(),
    };
  }

  /** /attendance/attend に _csrf を POST して結果を判定する。 */
  private async submitAttend(
    cookies: Record<string, string>,
    csrf: string,
    referer: string,
  ): Promise<AttendanceResult> {
    const resp = await fetch(ATTEND_URL, {
      method: 'POST',
      redirect: 'follow',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': USER_AGENT,
        Origin: ORIGIN,
        Referer: referer,
        Cookie: cookieHeader(cookies),
      },
      body: new URLSearchParams({ _csrf: csrf }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const html = await resp.text();

    if (/出席済みにしました|出席を登録しました|出席しました/.test(html)) {
      return { success: true, message: '出席完了', classDate: new Date() };
    }
    if (html.includes('出席できる授業はありません')) {
      return {
        success: false,
        message: '現在、出席できる授業はありません',
        classDate: new Date(),
      };
    }
    const err = extractErrorMessage(html);
    return {
      success: false,
      message: err || '出席登録の結果を判定できませんでした',
      classDate: new Date(),
    };
  }
}
