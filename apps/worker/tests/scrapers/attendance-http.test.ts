/**
 * AttendanceHttpAdapter のテスト (2026-06-26 実機検証フローに準拠)。
 * fetch を mock し、login(Referer/Origin必須・keeplogin無し) → class_room → /attendance/attend
 * の各分岐 (出席成功/既出席/授業なし/ログイン失敗) を固定する。状態判定は always-present な
 * モーダルテンプレでなく状態依存テキストで行うことを検証する。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { AttendanceHttpAdapter } from '../../src/scrapers/adapters/attendance-http';

const BASE = 'https://attendance.is.it-chiba.ac.jp';

const LOGIN_HTML =
  '<form action="/attendance/login" method="post"><input type="hidden" name="_csrf" value="csrf-login"><input name="username"><input name="password" type="password"></form>';
const CONFIRM_HTML = `<div>出席確認 6-7限 ７３１講義室 線形代数特論 14:00 〜 16:00 の授業を出席状態にしますか？
  <form action="/attendance/logout" method="post"><input type="hidden" name="_csrf" value="csrf-logout"><button>ログアウト</button></form>
  <form action="/attendance/attend" method="post"><input type="hidden" name="_csrf" value="csrf-attend"><button>出席で登録する</button></form>
  <div id="completeModal"></div><div id="errorModal"></div></div>`;
const DONE_HTML = '<div>出席完了 出席済みにしました。 閉じる<div id="completeModal"></div></div>';
const NOCLASS_HTML = '<div>出席できる授業はありません<div id="completeModal"></div></div>';

function resp(opts: {
  status?: number;
  body?: string;
  location?: string | null;
  cookies?: string[];
  url?: string;
}) {
  const { status = 200, body = '', location = null, cookies = [], url = '' } = opts;
  return {
    status,
    ok: status >= 200 && status < 300,
    url,
    headers: {
      get: (k: string) => (k.toLowerCase() === 'location' ? location : null),
      getSetCookie: () => cookies,
    },
    text: async () => body,
  } as unknown as Response;
}

// 各テストで差し替える分岐レスポンス
let loginPost: () => Response;
let classRoomGet: () => Response;
let attendPost: () => Response;
let calls: Array<{ url: string; method: string; opts: RequestInit }>;

function installFetch() {
  calls = [];
  const mock = vi.fn(async (url: string, opts: RequestInit = {}) => {
    const method = (opts.method || 'GET').toUpperCase();
    calls.push({ url, method, opts });
    if (url.endsWith('/attendance/login') && method === 'GET')
      return resp({ status: 200, body: LOGIN_HTML, cookies: ['JSESSIONID=s1; Path=/'] });
    if (url.endsWith('/attendance/login') && method === 'POST') return loginPost();
    if (url.includes('/attendance/class_room/')) return classRoomGet();
    if (url.endsWith('/attendance/attend') && method === 'POST') return attendPost();
    if (url.endsWith('/attendance/') && method === 'HEAD') return resp({ status: 302 });
    return resp({ status: 404, body: '?' });
  });
  vi.stubGlobal('fetch', mock);
}

beforeEach(() => {
  // 既定: ログイン成功 → class_room 出席確認 → attend 成功
  loginPost = () =>
    resp({ status: 302, location: '/attendance/top', cookies: ['JSESSIONID=s2; Path=/'] });
  classRoomGet = () => resp({ status: 200, body: CONFIRM_HTML, url: `${BASE}/attendance/top` });
  attendPost = () => resp({ status: 200, body: DONE_HTML });
  installFetch();
});
afterEach(() => vi.unstubAllGlobals());

describe('AttendanceHttpAdapter.attend', () => {
  it('login→class_room→/attendance/attend で出席成功', async () => {
    const a = new AttendanceHttpAdapter();
    const r = await a.attend('24G1140', 'pass', '7301');
    expect(r.success).toBe(true);
    expect(r.message).toBe('出席完了');
    // /attendance/attend に POST したか
    expect(calls.some((c) => c.url.endsWith('/attendance/attend') && c.method === 'POST')).toBe(true);
  });

  it('login POST に Referer/Origin を付け keeplogin を送らない', async () => {
    const a = new AttendanceHttpAdapter();
    await a.attend('24G1140', 'pass', '7301');
    const lp = calls.find((c) => c.url.endsWith('/attendance/login') && c.method === 'POST')!;
    const h = lp.opts.headers as Record<string, string>;
    expect(h.Referer).toContain('/attendance/login');
    expect(h.Origin).toBe(BASE);
    expect(String(lp.opts.body)).not.toContain('keeplogin');
    expect(String(lp.opts.body)).toContain('username=24G1140');
  });

  it('attend は正しいエンドポイント /attendance/attend を _csrf-attend で叩く', async () => {
    const a = new AttendanceHttpAdapter();
    await a.attend('u', 'p', '7301');
    const ap = calls.find((c) => c.url.endsWith('/attendance/attend'))!;
    expect(ap).toBeTruthy();
    expect(String(ap.opts.body)).toContain('_csrf=csrf-attend');
  });

  it('ログイン失敗(200再描画)は ScraperLoginError', async () => {
    loginPost = () => resp({ status: 200, body: LOGIN_HTML }); // 302でない=失敗
    const a = new AttendanceHttpAdapter();
    await expect(a.attend('u', 'wrong', '7301')).rejects.toThrow();
    // attend は呼ばれない
    expect(calls.some((c) => c.url.endsWith('/attendance/attend'))).toBe(false);
  });

  it('既に出席済みなら attend を叩かず success(出席済み)', async () => {
    classRoomGet = () => resp({ status: 200, body: DONE_HTML, url: `${BASE}/attendance/top` });
    const a = new AttendanceHttpAdapter();
    const r = await a.attend('u', 'p', '7301');
    expect(r.success).toBe(true);
    expect(r.message).toBe('出席済み');
    expect(calls.some((c) => c.url.endsWith('/attendance/attend'))).toBe(false);
  });

  it('出席できる授業が無い場合は failure', async () => {
    classRoomGet = () => resp({ status: 200, body: NOCLASS_HTML, url: `${BASE}/attendance/top` });
    const a = new AttendanceHttpAdapter();
    const r = await a.attend('u', 'p', '7301');
    expect(r.success).toBe(false);
    expect(r.message).toContain('出席できる授業はありません');
  });

  it('class_room がセッション切れで /login へ飛ぶと ScraperError', async () => {
    classRoomGet = () => resp({ status: 200, body: LOGIN_HTML, url: `${BASE}/attendance/login` });
    const a = new AttendanceHttpAdapter();
    await expect(a.attend('u', 'p', '7301')).rejects.toThrow();
  });
});

describe('AttendanceHttpAdapter 実 fixture (あるときだけ)', () => {
  const cr = resolve(process.cwd(), '.tmp/attend-classroom.html');
  const res = resolve(process.cwd(), '.tmp/attend-final-result.html');
  const it2 = existsSync(cr) && existsSync(res) ? it : it.skip;
  it2('実キャプチャ: 出席確認に attend フォーム、結果に「出席済みにしました」', () => {
    const confirm = readFileSync(cr, 'utf8');
    const result = readFileSync(res, 'utf8');
    expect(/action="[^"]*\/attendance\/attend/.test(confirm)).toBe(true);
    expect(confirm.includes('出席で登録する')).toBe(true);
    expect(confirm.includes('出席済みにしました')).toBe(false);
    expect(result.includes('出席済みにしました')).toBe(true);
  });
});
