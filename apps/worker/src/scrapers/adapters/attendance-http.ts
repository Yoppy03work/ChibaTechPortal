/**
 * 出席システム HTTPアダプタ
 *
 * WHY: 2026-03-23 CIT_Wi-Fiでの実測に基づく実装。
 * QRコードURL = /attendance/class_room/{教室名}
 * ログイン: _csrf + username + password + keeplogin
 * auth_hash cookie: 120日有効 → セッション再利用で毎回ログイン不要
 */
import type { AttendanceResult, AttendanceAdapter } from '@chibatech/shared';
import { ScraperLoginError, ScraperError } from '@chibatech/shared';

// WHY: 既定は本番 CIT 出席システム。ローカル検証で stub サーバへ向けたい場合のみ
// ATTENDANCE_BASE_URL で上書きする（production は未設定 → 既定のまま）。
const BASE_URL =
  process.env.ATTENDANCE_BASE_URL ?? 'https://attendance.is.it-chiba.ac.jp';
const LOGIN_URL = `${BASE_URL}/attendance/login`;
const TOP_URL = `${BASE_URL}/attendance/top`;

const USER_AGENT =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15';

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
  return Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ');
}

export class AttendanceHttpAdapter implements AttendanceAdapter {
  readonly name = 'http';

  /**
   * フルログインフローで出席する
   *
   * 1. GET /attendance/class_room/{roomId} → 302 → /login (JSESSIONID取得)
   * 2. GET /attendance/login → _csrf取得
   * 3. POST /attendance/login → 302 → /top (auth_hash取得)
   * 4. GET /attendance/top → HTML解析で結果判定
   */
  async attend(userId: string, password: string, roomId: string): Promise<AttendanceResult> {
    try {
      let cookies: Record<string, string> = {};

      // Step 1: 教室URLアクセス → JSESSIONID取得
      const classRoomUrl = `${BASE_URL}/attendance/class_room/${roomId}`;
      const step1 = await fetch(classRoomUrl, {
        redirect: 'manual',
        headers: { 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(10000),
      });
      cookies = { ...cookies, ...extractCookies(step1.headers) };

      // Step 2: ログインページ → _csrf取得
      const step2 = await fetch(LOGIN_URL, {
        headers: {
          'User-Agent': USER_AGENT,
          Cookie: cookieHeader(cookies),
        },
        signal: AbortSignal.timeout(10000),
      });
      cookies = { ...cookies, ...extractCookies(step2.headers) };
      const loginHtml = await step2.text();

      const csrfMatch = loginHtml.match(/name="_csrf"\s+value="([^"]*)"/);
      if (!csrfMatch) {
        throw new ScraperLoginError('attendance', this.name, 'CSRF token not found');
      }

      // Step 3: ログインPOST
      const step3 = await fetch(LOGIN_URL, {
        method: 'POST',
        redirect: 'manual',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': USER_AGENT,
          Cookie: cookieHeader(cookies),
        },
        body: new URLSearchParams({
          _csrf: csrfMatch[1]!,
          username: userId,
          password: password,
          keeplogin: 'on',
        }),
        signal: AbortSignal.timeout(10000),
      });
      cookies = { ...cookies, ...extractCookies(step3.headers) };

      const location = step3.headers.get('location') || '';

      // WHY: ログイン失敗時は /attendance/login にリダイレクトされる
      if (step3.status === 302 && location.includes('/login')) {
        throw new ScraperLoginError('attendance', this.name);
      }

      // Step 4: ログイン後ページ解析
      return await this.parseTopPage(cookies);
    } catch (error) {
      if (error instanceof ScraperError) throw error;
      throw new ScraperError('Attendance failed', 'attendance', this.name, error);
    }
  }

  /**
   * auth_hash cookieでセッション再利用して出席する（再ログイン不要）
   * WHY: auth_hashは120日有効。毎回ログインする必要がない
   */
  async attendWithSession(cookies: Record<string, string>, roomId: string): Promise<AttendanceResult> {
    try {
      // auth_hashがあれば直接topページにアクセス可能
      const resp = await fetch(TOP_URL, {
        redirect: 'manual',
        headers: {
          'User-Agent': USER_AGENT,
          Cookie: cookieHeader(cookies),
        },
        signal: AbortSignal.timeout(10000),
      });

      // WHY: セッション切れの場合はloginにリダイレクトされる
      if (resp.status === 302) {
        const location = resp.headers.get('location') || '';
        if (location.includes('/login')) {
          throw new ScraperError('Session expired', 'attendance', this.name);
        }
      }

      const newCookies = { ...cookies, ...extractCookies(resp.headers) };
      return await this.parseTopPage(newCookies);
    } catch (error) {
      if (error instanceof ScraperError) throw error;
      throw new ScraperError('Attendance with session failed', 'attendance', this.name, error);
    }
  }

  /** 出席システム到達性チェック */
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
   * /attendance/top のHTMLを解析して出席結果を判定する
   */
  private async parseTopPage(cookies: Record<string, string>): Promise<AttendanceResult> {
    const resp = await fetch(TOP_URL, {
      headers: {
        'User-Agent': USER_AGENT,
        Cookie: cookieHeader(cookies),
      },
      signal: AbortSignal.timeout(10000),
    });

    const html = await resp.text();

    // WHY: 実測で判明した判定ロジック
    // 成功: #completeModal が存在する
    if (html.includes('completeModal')) {
      return {
        success: true,
        message: '出席完了',
        classDate: new Date(),
      };
    }

    // エラー: #errorModal が存在する
    if (html.includes('errorModal')) {
      // エラーメッセージを抽出（モーダル内のテキスト）
      const errorMatch = html.match(/id="errorModal"[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/);
      const errorMsg = errorMatch?.[1]?.replace(/<[^>]*>/g, '').trim() || '出席エラー';
      return {
        success: false,
        message: errorMsg,
        classDate: new Date(),
      };
    }

    // 授業なし: .alert_message に「出席できる授業はありません」
    if (html.includes('出席できる授業はありません')) {
      return {
        success: false,
        message: '現在、出席できる授業はありません',
        classDate: new Date(),
      };
    }

    // WHY: 上記以外は出席フォームが表示されている状態。フォームをsubmitする必要がある
    // 出席フォームのCSRFトークンを取得してsubmit
    const csrfMatch = html.match(/name="_csrf"\s+value="([^"]*)"/);
    if (csrfMatch && html.includes('id="attend"')) {
      return await this.submitAttendance(cookies, csrfMatch[1]!);
    }

    return {
      success: false,
      message: '出席状態を判定できませんでした',
      classDate: new Date(),
    };
  }

  /**
   * 出席フォームをsubmitする
   */
  private async submitAttendance(cookies: Record<string, string>, csrf: string): Promise<AttendanceResult> {
    // WHY: 実測でform actionは /attendance/top にPOST
    const resp = await fetch(TOP_URL, {
      method: 'POST',
      redirect: 'follow',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': USER_AGENT,
        Cookie: cookieHeader(cookies),
      },
      body: new URLSearchParams({ _csrf: csrf }),
      signal: AbortSignal.timeout(10000),
    });

    const html = await resp.text();

    if (html.includes('completeModal')) {
      return {
        success: true,
        message: '出席完了',
        classDate: new Date(),
      };
    }

    if (html.includes('errorModal')) {
      const errorMatch = html.match(/id="errorModal"[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/);
      const errorMsg = errorMatch?.[1]?.replace(/<[^>]*>/g, '').trim() || '出席登録エラー';
      return {
        success: false,
        message: errorMsg,
        classDate: new Date(),
      };
    }

    return {
      success: false,
      message: '出席登録の結果を判定できませんでした',
      classDate: new Date(),
    };
  }
}
