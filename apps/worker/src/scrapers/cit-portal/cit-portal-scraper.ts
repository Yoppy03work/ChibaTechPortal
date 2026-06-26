// CITポータル(Universal Passport RX)から時間割をスクレイプする層。
//
// 出自: 姉妹プロジェクト「モチカタ」の実証済み実装 (src/lib/citPortalScrape.ts) を
//   ChibaTechPortal の孤立モジュールとして移植したもの。CIT 統合認証は Keycloak +
//   MFA(TOTP) を要求するため、SSO の多段フロー(Shibboleth→Keycloak→credential-select→
//   OTP→SAML→UNIPA menuForm nav)を素の fetch で再現する。上流(Keycloak/UNIPA)は
//   変わり続けるため、モチカタ版と構造を揃えて同期しやすく保つこと。
//   cheerio + otpauth のみに依存し、ChibaTechPortal の他層には依存しない(意図的)。
//   このモジュールは「ログイン+認証済み時間割 HTML の取得」までを担い、HTML の
//   パースは ChibaTechPortal 検証済みの header ベースパーサ (timetable-parser.ts) に
//   委譲する(パーサ of record を一本化し、曜日の位置依存を避けるため)。
//   モチカタ版の parseTimetableHtml は移植時に意図的に持ち込まない(差分は login 部のみ同期)。
//
// 認証フロー:
//   1. GET https://portal.chibatech.ac.jp/uprx/up/bs/bsa001/Bsa00101.xhtml
//      → 未認証なら 302 で Keycloak (SAML IdP) に飛ぶ
//   2. SAMLRequest 付き URL を follow
//      → Keycloak の login form (id="kc-form-login") が表示される
//   3. POST username + password (action は form.action そのまま)
//      → Keycloak の OTP form (id="kc-otp-login-form") が返る
//   4. otp + selectedCredentialId を POST
//      → SAML auto-submit form (action= portal.../uprx/ShibbolethAuthServlet) が返る
//   5. SAMLResponse + RelayState を SP に POST
//      → 302 で portal の元ページ or ホーム (Pkx00701.xhtml) に戻る
//   6. 必要に応じて時間割ページ (Bsa00101.xhtml) を GET
//      → JSF/PrimeFaces のテーブルから時間割を抽出
//
// 環境変数:
//   - CIT_PORTAL_BASE_URL: ポータル基準URL (既定 "https://portal.chibatech.ac.jp")
//   - CIT_PORTAL_DEBUG=1: 各ステップ後の HTML サイズと検出フォームをログ出力

import * as cheerio from "cheerio";
import type { AnyNode } from "domhandler";
import { TOTP } from "otpauth";

export class CitPortalError extends Error {
  constructor(
    message: string,
    public readonly stage:
      | "config"
      | "login"
      | "mfa"
      | "fetch"
      | "parse"
      | "session",
  ) {
    super(message);
    this.name = "CitPortalError";
  }
}

const DEFAULT_BASE = "https://portal.chibatech.ac.jp";
const TIMETABLE_PATH = "/uprx/up/bs/bsa001/Bsa00101.xhtml";
const UA = "Mozilla/5.0 (ChibaTechPortal) Node fetch (Personal use)";
const DEBUG = process.env.CIT_PORTAL_DEBUG === "1";

// ─────────────────────────────────────────
// Multi-host cookie jar
// 1リクエスト1ホストではなく、複数ドメイン(portal/sso)を跨ぐので
// ホスト別に Cookie を保持する。Domain 属性は無視して response host に紐付け。
// ─────────────────────────────────────────
type HostCookieJar = Map<string, Map<string, string>>;

function getCookieHeader(jar: HostCookieJar, host: string): string {
  const cookies = jar.get(host);
  if (!cookies || cookies.size === 0) return "";
  return [...cookies.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

function ingestSetCookie(
  jar: HostCookieJar,
  host: string,
  headers: Headers,
): void {
  const list = (
    typeof (headers as unknown as { getSetCookie?: () => string[] })
      .getSetCookie === "function"
      ? (headers as unknown as { getSetCookie: () => string[] }).getSetCookie()
      : []
  ) as string[];
  let bucket = jar.get(host);
  if (!bucket) {
    bucket = new Map();
    jar.set(host, bucket);
  }
  for (const raw of list) {
    const semi = raw.indexOf(";");
    const pair = (semi === -1 ? raw : raw.slice(0, semi)).trim();
    const eq = pair.indexOf("=");
    if (eq <= 0) continue;
    const name = pair.slice(0, eq).trim();
    const value = pair.slice(eq + 1).trim();
    if (!name) continue;
    if (!value) {
      bucket.delete(name);
      continue;
    }
    bucket.set(name, value);
  }
}

/**
 * 手動リダイレクト方式の fetch。
 * 各リダイレクトでクッキーを取り込み、host単位で送り直す。
 * 302/303 の Location は新しいGETに、307/308 は元のメソッド維持で follow。
 */
async function portalFetch(
  jar: HostCookieJar,
  url: string,
  init: RequestInit | undefined,
  maxRedirects = 12,
): Promise<{ res: Response; finalUrl: string }> {
  let currentUrl = url;
  let currentInit: RequestInit = { ...(init ?? {}) };

  for (let i = 0; i < maxRedirects; i++) {
    const u = new URL(currentUrl);
    const headers = new Headers(currentInit.headers);
    headers.set("User-Agent", UA);
    if (!headers.has("Accept")) {
      headers.set(
        "Accept",
        "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      );
    }
    headers.set("Accept-Language", "ja,en;q=0.5");
    const cookieHeader = getCookieHeader(jar, u.host);
    if (cookieHeader) headers.set("Cookie", cookieHeader);

    let res: Response;
    try {
      res = await fetch(currentUrl, {
        ...currentInit,
        headers,
        redirect: "manual",
      });
    } catch (e) {
      const cause = (e as { cause?: unknown }).cause;
      const causeMsg =
        cause instanceof Error
          ? `${cause.name}: ${cause.message}`
          : cause
            ? String(cause)
            : "unknown";
      // WHY: クエリ文字列を落として origin+pathname のみログに残す。Keycloak の
      // リダイレクト URL は SAMLRequest/RelayState を query に持ち、例外メッセージ経由で
      // SSO リクエストパラメータがログ/例外トラッカに乗るのを避ける。
      let safeUrl = currentUrl;
      try {
        const u = new URL(currentUrl);
        safeUrl = `${u.origin}${u.pathname}`;
      } catch {
        /* noop */
      }
      throw new CitPortalError(
        `${e instanceof Error ? e.message : "fetch failed"} url=${safeUrl} cause=${causeMsg}`,
        "fetch",
      );
    }

    ingestSetCookie(jar, u.host, res.headers);

    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) return { res, finalUrl: currentUrl };
      const next = new URL(loc, currentUrl).toString();
      // 302 / 303: GET にダウングレード(RFC 7231)
      // 307 / 308: メソッド・ボディ維持
      if (res.status === 307 || res.status === 308) {
        currentInit = { ...currentInit, headers: undefined };
      } else {
        currentInit = { method: "GET" };
      }
      currentUrl = next;
      continue;
    }

    return { res, finalUrl: currentUrl };
  }
  throw new CitPortalError(`too many redirects starting at ${url}`, "fetch");
}

// ─────────────────────────────────────────
// Form 抽出ヘルパ
// ─────────────────────────────────────────
type ParsedForm = {
  action: string;
  method: string;
  fields: Record<string, string>;
};

function parseFormById(
  html: string,
  baseUrl: string,
  id: string,
): ParsedForm | null {
  const $ = cheerio.load(html);
  const $form = $(`form#${id}`).first();
  if ($form.length === 0) return null;
  return parseFormElement($, $form, baseUrl);
}

function parseFirstPostForm(html: string, baseUrl: string): ParsedForm | null {
  const $ = cheerio.load(html);
  const $form = $('form[method="post"], form[method="POST"]').first();
  if ($form.length === 0) return null;
  return parseFormElement($, $form, baseUrl);
}

function parseFormElement(
  $: cheerio.CheerioAPI,
  $form: cheerio.Cheerio<AnyNode>,
  baseUrl: string,
): ParsedForm {
  const actionAttr = ($form.attr("action") || "").trim();
  // attr() は HTML エンティティをデコードして返す
  const action = actionAttr ? new URL(actionAttr, baseUrl).toString() : baseUrl;
  const method = ($form.attr("method") || "GET").toUpperCase();
  const fields: Record<string, string> = {};
  $form.find("input").each((_, el) => {
    const $el = $(el);
    const type = ($el.attr("type") || "text").toLowerCase();
    const name = $el.attr("name");
    if (!name) return;
    if (type === "submit" || type === "button" || type === "reset") return;
    if (type === "checkbox" || type === "radio") {
      if ($el.attr("checked") !== undefined) {
        fields[name] = $el.attr("value") ?? "on";
      }
      return;
    }
    fields[name] = $el.attr("value") ?? "";
  });
  $form.find("textarea").each((_, el) => {
    const $el = $(el);
    const name = $el.attr("name");
    if (!name) return;
    fields[name] = $el.text();
  });
  $form.find("select").each((_, el) => {
    const $el = $(el);
    const name = $el.attr("name");
    if (!name) return;
    const $sel = $el.find("option[selected]").first();
    fields[name] =
      $sel.length > 0
        ? ($sel.attr("value") ?? $sel.text())
        : ($el.find("option").first().attr("value") ?? "");
  });
  return { action, method, fields };
}

function debugLog(label: string, html: string): void {
  if (!DEBUG) return;
  const formIds = [...html.matchAll(/<form[^>]*\sid="([^"]+)"/g)].map(
    (m) => m[1],
  );
  const hasSamlResponse = /name="SAMLResponse"/.test(html);
  console.log(
    `[cit-portal][${label}] size=${html.length} forms=[${formIds.join(",")}] saml=${hasSamlResponse}`,
  );
}

// ─────────────────────────────────────────
// SSO + MFA ログイン
// ─────────────────────────────────────────
async function login(
  jar: HostCookieJar,
  baseUrl: string,
  username: string,
  password: string,
  totpSecret: string,
  totpDeviceName: string | null,
): Promise<string> {
  // 1. 時間割ページを叩く。未認証なら UPRX のログイン選択ページに着地する
  //    (ここから Shibboleth リンクを経由して Keycloak へ飛ぶ追加ステップが必要)
  const initial = await portalFetch(
    jar,
    `${baseUrl}${TIMETABLE_PATH}`,
    undefined,
  );
  if (!initial.res.ok) {
    throw new CitPortalError(
      `初期ページ取得失敗 (HTTP ${initial.res.status}) finalUrl=${initial.finalUrl}`,
      "fetch",
    );
  }
  let html = await initial.res.text();
  let lastUrl = initial.finalUrl;
  debugLog("after initial", html);

  // 既に認証済みでそのまま時間割が返ってきたケース
  if (
    html.includes("classTable") ||
    (html.includes("Pkx00701") && !html.includes("kc-form-login")) ||
    html.includes("rx-token")
  ) {
    return html;
  }

  // 2. UPRX ログイン選択ページに着地した場合は、統合認証(Shibboleth)リンクを踏む。
  //    典型パターン: <a href="https://portal.chibatech.ac.jp/uprx/ShibbolethAuthServlet"
  //    ...>在学生・教職員専用ログイン（統合認証）</a>
  if (!parseFormById(html, lastUrl, "kc-form-login")) {
    const $ = cheerio.load(html);
    let shibUrl: string | null = null;
    $("a[href]").each((_, el) => {
      const href = $(el).attr("href") || "";
      if (/ShibbolethAuthServlet/i.test(href)) {
        shibUrl = new URL(href, lastUrl).toString();
        return false;
      }
    });
    if (shibUrl) {
      const r = await portalFetch(jar, shibUrl, undefined);
      if (!r.res.ok) {
        throw new CitPortalError(
          `Shibboleth開始失敗 (HTTP ${r.res.status}) url=${shibUrl}`,
          "login",
        );
      }
      html = await r.res.text();
      lastUrl = r.finalUrl;
      debugLog("after Shibboleth start", html);
    }
  }

  // 3. Keycloak ログインフォーム解析
  const loginForm = parseFormById(html, lastUrl, "kc-form-login");
  if (!loginForm) {
    throw new CitPortalError(
      "Keycloakログインフォームが見つかりません(IdPの仕様変更?)",
      "login",
    );
  }

  // 4. ID/パスワード POST
  const credBody = new URLSearchParams();
  credBody.set("username", username);
  credBody.set("password", password);
  credBody.set("credentialId", loginForm.fields.credentialId ?? "");
  credBody.set("login", "Sign In");
  // rememberMe は未チェック扱い(送らない)
  let resp = await portalFetch(jar, loginForm.action, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Origin: new URL(loginForm.action).origin,
      Referer: lastUrl,
    },
    body: credBody.toString(),
  });
  if (!resp.res.ok) {
    throw new CitPortalError(
      `ログインPOST失敗 (HTTP ${resp.res.status})`,
      "login",
    );
  }
  html = await resp.res.text();
  lastUrl = resp.finalUrl;
  debugLog("after credentials POST", html);

  // ID/パスワード誤りなら login form が再び表示される
  if (parseFormById(html, lastUrl, "kc-form-login")) {
    // エラーメッセージ抽出を試みる
    const $err = cheerio.load(html);
    const errMsg = $err(
      ".alert-error, .pf-v5-c-alert__title, .pf-c-alert__title, [data-testid='login-error'], #input-error-username, #input-error-password",
    )
      .first()
      .text()
      .trim();
    throw new CitPortalError(
      `ログイン失敗: ID/パスワードが違う可能性${errMsg ? ` [${errMsg.slice(0, 120)}]` : ""}`,
      "login",
    );
  }

  // 4.5. クレデンシャル選択画面が出ていればここで選択POST。
  //      Keycloak は MFA手段が複数登録されてると "select-credential" 画面を挟む。
  //      ラジオの name="authenticationExecution"、value=各クレデンシャルのID。
  //      ラベルテキストに totpDeviceName が含まれるものを優先選択。
  const selectForm = parseFormById(html, lastUrl, "kc-select-credential-form");
  if (selectForm) {
    const $sel = cheerio.load(html);
    type Option = { id: string; label: string };
    const options: Option[] = [];
    $sel("input[name='authenticationExecution']").each((_, el) => {
      const id = $sel(el).attr("value") || "";
      if (!id) return;
      const inputId = $sel(el).attr("id") || "";
      const label = inputId
        ? $sel(`label[for="${inputId}"]`).first().text().trim()
        : "";
      options.push({ id, label });
    });
    if (options.length === 0) {
      // ラジオが見つからない場合、button[name='authenticationExecution'] パターンを試す
      $sel("button[name='authenticationExecution']").each((_, el) => {
        const id = $sel(el).attr("value") || "";
        if (!id) return;
        const label = $sel(el).text().trim();
        options.push({ id, label });
      });
    }
    if (options.length === 0) {
      throw new CitPortalError(
        "クレデンシャル選択画面が表示されたが、選択肢が抽出できなかった",
        "mfa",
      );
    }
    let chosen: Option | undefined;
    if (totpDeviceName) {
      const needle = totpDeviceName.toLowerCase();
      chosen = options.find((o) => o.label.toLowerCase().includes(needle));
    }
    if (!chosen) chosen = options[0];
    if (DEBUG) {
      console.log(
        `[cit-portal][select-credential] options=${options.map((o) => `${o.label}#${o.id.slice(0, 6)}`).join(", ")} chosen=${chosen.label}`,
      );
    }
    const selBody = new URLSearchParams();
    // 元フォームの hidden inputs を引き継ぐ(authexec-hidden-input 等)
    for (const [k, v] of Object.entries(selectForm.fields)) {
      if (k === "authenticationExecution") continue;
      selBody.set(k, v);
    }
    selBody.set("authenticationExecution", chosen.id);
    selBody.set("login", "Sign In");
    const r = await portalFetch(jar, selectForm.action, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Origin: new URL(selectForm.action).origin,
        Referer: lastUrl,
      },
      body: selBody.toString(),
    });
    if (!r.res.ok) {
      throw new CitPortalError(
        `クレデンシャル選択POST失敗 (HTTP ${r.res.status})`,
        "mfa",
      );
    }
    html = await r.res.text();
    lastUrl = r.finalUrl;
    debugLog("after credential pick", html);
  }

  // 5. OTP フォーム解析
  const otpForm = parseFormById(html, lastUrl, "kc-otp-login-form");
  if (!otpForm) {
    throw new CitPortalError(
      "OTP入力フォームが見つかりません(MFAがTOTPでない可能性: パスキーや別のAuthenticatorに切り替わってる?)",
      "mfa",
    );
  }

  // 6. TOTP コード生成 + POST
  let otpCode: string;
  try {
    otpCode = generateTotpCode(totpSecret);
  } catch (e) {
    throw new CitPortalError(
      `TOTP生成失敗: ${e instanceof Error ? e.message : String(e)}`,
      "config",
    );
  }

  // OTPフォーム内に複数のTOTPデバイスが切替UIで埋まっているケース。
  // hidden の selectedCredentialId はデフォルト(=先頭デバイス)の UUID を持つ。
  // クリック切替で値を書き換える JS が走るが、サーバーから来た時点では
  // デフォルトのままなので、こちらでデバイス名マッチで上書きする。
  let chosenCredId: string | null =
    otpForm.fields.selectedCredentialId || null;
  if (totpDeviceName) {
    const $otp = cheerio.load(html);
    type Opt = { id: string; label: string };
    const opts: Opt[] = [];
    // パターンA: <input type="radio" name="selectedCredentialId" value="<id>"> + 紐づく label
    $otp("input[name='selectedCredentialId']").each((_, el) => {
      const $el = $otp(el);
      const type = ($el.attr("type") || "").toLowerCase();
      const value = $el.attr("value") || "";
      if (!value) return;
      if (type !== "radio" && type !== "hidden") return;
      const inputId = $el.attr("id") || "";
      const label = inputId
        ? $otp(`label[for="${inputId}"]`).first().text().trim()
        : "";
      opts.push({ id: value, label });
    });
    // パターンB: data-credentialid 属性を持つボタンやリンク
    $otp("[data-credentialid]").each((_, el) => {
      const $el = $otp(el);
      const value = $el.attr("data-credentialid") || "";
      if (!value) return;
      const label = $el.text().trim() || $el.attr("aria-label") || "";
      if (!opts.some((o) => o.id === value)) opts.push({ id: value, label });
    });
    // パターンC: PatternFly tile の onclick="toggleOTP(N, 'UUID')" から抽出。
    // タイトルは <span class="pf-v5-c-tile__title"> に入る。
    // (CITポータル/Keycloak26 で実際に使われていた構造)
    $otp(
      'div[onclick^="toggleOTP"], div[id^="kc-otp-credential-"], .pf-v5-c-tile[onclick]',
    ).each((_, el) => {
      const $el = $otp(el);
      const onclick = $el.attr("onclick") || "";
      const m = onclick.match(
        /toggleOTP\(\s*\d+\s*,\s*['"]([^'"]+)['"]\s*\)/,
      );
      if (!m) return;
      const id = m[1];
      const titleSpan = $el
        .find("span.pf-v5-c-tile__title, .pf-v5-c-tile__title")
        .first()
        .text()
        .trim();
      const label = titleSpan || $el.text().replace(/\s+/g, " ").trim();
      if (!opts.some((o) => o.id === id)) opts.push({ id, label });
    });
    const needle = totpDeviceName.toLowerCase();
    const matched = opts.find((o) =>
      o.label.toLowerCase().includes(needle),
    );
    if (matched) {
      chosenCredId = matched.id;
    }
    if (DEBUG) {
      // WHY(redacted): 生 HTML ダンプはしない。OTP フォームの生 HTML には
      // selectedCredentialId(TOTP デバイスの credential UUID)が含まれ、ログに残ると
      // MFA デバイス識別子の漏洩になる。パース済みの「ラベル + 切り詰め id」だけ出す。
      console.log(
        `[cit-portal][otp-credentials] options=${opts.length === 0 ? "(none)" : opts.map((o) => `"${o.label}"#${o.id.slice(0, 8)}`).join(", ")} matched=${matched ? matched.label : "(none, using default)"}`,
      );
    }
  }

  const otpBody = new URLSearchParams();
  if (chosenCredId) otpBody.set("selectedCredentialId", chosenCredId);
  otpBody.set("otp", otpCode);
  otpBody.set("login", "Sign In");
  if (DEBUG) {
    // OTPは出さない。selectedCredentialIdとactionだけ。
    console.log(
      `[cit-portal][otp-post] credId=${chosenCredId?.slice(0, 8) ?? "(none)"} action=${otpForm.action.slice(0, 100)}…`,
    );
  }
  resp = await portalFetch(jar, otpForm.action, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Origin: new URL(otpForm.action).origin,
      Referer: lastUrl,
    },
    body: otpBody.toString(),
  });
  if (!resp.res.ok) {
    throw new CitPortalError(
      `OTP POST 失敗 (HTTP ${resp.res.status})`,
      "mfa",
    );
  }
  html = await resp.res.text();
  lastUrl = resp.finalUrl;
  debugLog("after OTP POST", html);

  // OTP 誤りなら OTP フォームが再び表示される
  if (parseFormById(html, lastUrl, "kc-otp-login-form")) {
    // Keycloakが返したエラーメッセージを抽出してログ可能な形にする
    const $err = cheerio.load(html);
    const alert = $err(
      ".alert-error, .pf-v5-c-alert__title, .pf-c-alert__title, [data-testid='login-error'], #input-error-otp",
    )
      .first()
      .text()
      .trim();
    throw new CitPortalError(
      `OTPコードが不正(時計ズレ or シークレット間違い)${alert ? ` [${alert.slice(0, 120)}]` : ""}`,
      "mfa",
    );
  }

  // 7. SAML auto-submit form を解析して SP にPOST
  const samlForm = parseFirstPostForm(html, lastUrl);
  if (!samlForm || !samlForm.fields.SAMLResponse) {
    throw new CitPortalError(
      "SAMLResponseが見つかりません(認証フロー想定外)",
      "session",
    );
  }
  const samlBody = new URLSearchParams();
  for (const [k, v] of Object.entries(samlForm.fields)) {
    samlBody.set(k, v);
  }
  if (DEBUG) {
    console.log(
      `[cit-portal][saml-post] action=${samlForm.action} fields=[${Object.keys(samlForm.fields).join(",")}]`,
    );
  }
  resp = await portalFetch(jar, samlForm.action, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Origin: new URL(samlForm.action).origin,
      Referer: lastUrl,
    },
    body: samlBody.toString(),
  });
  if (!resp.res.ok) {
    throw new CitPortalError(
      `SAMLResponse POST 失敗 (HTTP ${resp.res.status})`,
      "session",
    );
  }
  html = await resp.res.text();
  lastUrl = resp.finalUrl;
  debugLog("after SAML POST", html);
  if (DEBUG) {
    console.log(`[cit-portal][saml-post] finalUrl=${lastUrl}`);
    // Cookie 状態の表示(各host単位、値はマスク)
    const portalHost = new URL(baseUrl).host;
    const portalCookies = jar.get(portalHost);
    console.log(
      `[cit-portal][cookies] ${portalHost}: ${portalCookies ? [...portalCookies.keys()].join(", ") : "(none)"}`,
    );
    // form/auto-submit/meta-refresh/JSリダイレクトの痕跡を探す
    const metaRefresh = html.match(
      /<meta[^>]*http-equiv=["']refresh["'][^>]*content=["']([^"']+)["']/i,
    );
    const jsRedirect = html.match(
      /(?:window\.location(?:\.href)?\s*=\s*|location\.href\s*=\s*)["']([^"']+)["']/i,
    );
    const errorMsg = (() => {
      const $$ = cheerio.load(html);
      return $$(".errorblock, .alert-danger, .frInformation, [class*='error']")
        .first()
        .text()
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 200);
    })();
    console.log(
      `[cit-portal][saml-post] meta-refresh=${metaRefresh?.[1] ?? "(none)"} js-redirect=${jsRedirect?.[1] ?? "(none)"} err="${errorMsg}"`,
    );
    // WHY(redacted): post-auth レスポンス body の生ダンプはしない。この body には
    // rx-token / rx-loginKey / javax.faces.ViewState などの live JSF セッション秘密が
    // hidden input として含まれ、ログに残ると認証済みセッションの乗っ取りに使える。
    // 構造把握には下の「form 構造(input は name のみ)」で十分。
    // form 構造を整理
    const $ck = cheerio.load(html);
    $ck("form").each((_, fEl) => {
      const $f = $ck(fEl);
      const id = $f.attr("id") || "(no id)";
      const action = $f.attr("action") || "(no action)";
      const method = $f.attr("method") || "GET";
      const inputs = $f
        .find("input")
        .map((_, el) => {
          const n = $ck(el).attr("name");
          const t = $ck(el).attr("type") || "text";
          return n ? `${n}(${t})` : null;
        })
        .toArray()
        .filter(Boolean);
      console.log(
        `[cit-portal][saml-post-form] id=${id} method=${method} action=${action} inputs=[${inputs.join(",")}]`,
      );
    });
    // <body onload="..."> の autosubmit 検出
    const bodyOnload = $ck("body").attr("onload") || "";
    if (bodyOnload) {
      console.log(`[cit-portal][saml-post-onload] ${bodyOnload}`);
    }
  }

  // 時間割テーブルが含まれていればここで完了
  if (html.includes("classTable")) {
    return html;
  }

  // SAML完了後の Pky00102 中継ページの autoLogin ボタンを擬似押下。
  // 通常はJSが loginForm:autoLogin を click→form submit する仕組みだが、
  // 我々はJSを実行しないので、フォームPOSTで等価の挙動を再現する。
  // (これが成功すると 302 でホーム Pkx00701 に飛ぶ)
  if (html.includes("Pky00102") && html.includes("autoLogin")) {
    const $tr = cheerio.load(html);
    const $form = $tr("form#loginForm");
    if ($form.length > 0) {
      const action = new URL(
        $form.attr("action") || "",
        lastUrl,
      ).toString();
      const body = new URLSearchParams();
      $form.find("input").each((_, el) => {
        const n = $tr(el).attr("name");
        const v = $tr(el).attr("value") ?? "";
        if (n) body.set(n, v);
      });
      // 隠し submit ボタンの値(JSF はボタン名を含めることでそれが押されたと判定)
      body.set("loginForm:autoLogin", "");
      if (DEBUG) {
        console.log(
          `[cit-portal][autoLogin] POST ${action} fields=[${[...body.keys()].join(",")}]`,
        );
      }
      const r = await portalFetch(jar, action, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Origin: new URL(action).origin,
          Referer: lastUrl,
        },
        body: body.toString(),
      });
      if (r.res.ok) {
        html = await r.res.text();
        lastUrl = r.finalUrl;
        debugLog("after autoLogin POST", html);
      }
    }
  }

  // 時間割テーブルが含まれていればここで完了(autoLogin直後にもチェック)
  if (html.includes("classTable")) {
    return html;
  }

  // ホームページ(Pkx00701)に着地した場合は menuForm 経由で時間割へナビゲート。
  // JSF/PrimeFaces のサイドメニュー押下を再現する形。
  // 必要なフィールド: menuForm 自身, rx-token, rx-loginKey, rx-deviceKbn,
  // rx-loginType, javax.faces.ViewState, menuForm:mainMenu_menuid, menuForm:mainMenu
  if (
    html.includes("Pkx00701") ||
    html.includes("rx-token") ||
    html.includes("menuForm")
  ) {
    const $home = cheerio.load(html);
    const $menu = $home("form#menuForm, form[id$=':menuForm']").first();
    if ($menu.length > 0) {
      const fields: Record<string, string> = {};
      $menu.find("input").each((_, el) => {
        const name = $home(el).attr("name");
        const value = $home(el).attr("value") ?? "";
        if (name) fields[name] = value;
      });
      // 時間割表メニュー項目の menuid を探す。
      // PrimeFaces の menu リンクは
      //   <a data-pfconfirmcommand="...'menuForm:mainMenu_menuid':'X_Y_Z'..."><span class="ui-menuitem-text">{ラベル}</span></a>
      // という構造。span のラベル完全一致(=「時間割表」)で正しいリンクを特定する。
      let menuid: string | null = null;
      type MenuOpt = { label: string; menuid: string };
      const menuOpts: MenuOpt[] = [];
      $home("a[data-pfconfirmcommand]").each((_, el) => {
        const $a = $home(el);
        const cmd = $a.attr("data-pfconfirmcommand") || "";
        const m = cmd.match(/'menuForm:mainMenu_menuid'\s*:\s*'([^']+)'/);
        if (!m) return;
        const label =
          $a.find("span.ui-menuitem-text").first().text().trim() ||
          $a.text().trim();
        menuOpts.push({ label, menuid: m[1] });
      });
      // 完全一致 "時間割表" が最優先、なければ部分一致(試験時間割等は除外)
      const exact = menuOpts.find((o) => o.label === "時間割表");
      const partial = exact
        ? null
        : menuOpts.find(
            (o) => o.label.includes("時間割") && !o.label.includes("試験"),
          );
      menuid = exact?.menuid ?? partial?.menuid ?? null;
      if (DEBUG) {
        const display = menuOpts
          .filter(
            (o) =>
              o.label.includes("時間割") ||
              o.label.includes("履修") ||
              o.label.includes("授業"),
          )
          .map((o) => `"${o.label}":${o.menuid}`)
          .join(", ");
        console.log(
          `[cit-portal][menu-nav] candidates=[${display}] picked=${exact ? "exact" : partial ? "partial" : "(none)"} menuid=${menuid} fields=[${Object.keys(fields).join(",")}]`,
        );
      }
      if (menuid) {
        const navBody = new URLSearchParams();
        for (const [k, v] of Object.entries(fields)) navBody.set(k, v);
        // ブラウザが menu クリック時に出すパラメータをエミュレート
        // (HARから取った組み合わせ: menuForm, rx.sync.source, menuForm:mainMenu, menuForm:mainMenu_menuid)
        navBody.set("menuForm", "menuForm");
        navBody.set("rx.sync.source", "menuForm:mainMenu");
        navBody.set("menuForm:mainMenu", "menuForm:mainMenu");
        navBody.set("menuForm:mainMenu_menuid", menuid);
        const navAction = $menu.attr("action")
          ? new URL($menu.attr("action") || "", lastUrl).toString()
          : lastUrl;
        // ※ Faces-Request:partial/ajax は付けない(付けると JSF が XML を返してしまう)
        //   通常のフォーム POST として送ると、サーバーは新ビュー(時間割HTML)を返す
        const r = await portalFetch(jar, navAction, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Origin: new URL(navAction).origin,
            Referer: lastUrl,
          },
          body: navBody.toString(),
        });
        if (r.res.ok) {
          html = await r.res.text();
          lastUrl = r.finalUrl;
          debugLog("after menu nav POST", html);
          if (DEBUG) {
            console.log(
              `[cit-portal][menu-nav] action=${navAction} finalUrl=${lastUrl}`,
            );
          }
        }
      }
    }
  }

  // 直接GETもフォールバックとして試す
  if (!html.includes("classTable")) {
    const r = await portalFetch(jar, `${baseUrl}${TIMETABLE_PATH}`, undefined);
    if (r.res.ok) {
      html = await r.res.text();
      debugLog("after direct timetable GET", html);
    }
  }

  return html;
}

// ─────────────────────────────────────────
// TOTP
// ─────────────────────────────────────────
export function generateTotpCode(secretBase32: string): string {
  const totp = new TOTP({
    secret: secretBase32,
    digits: 6,
    period: 30,
    algorithm: "SHA1",
  });
  return totp.generate();
}

// ─────────────────────────────────────────
// エントリーポイント
// ─────────────────────────────────────────
/**
 * CITポータルに統合認証(SSO+MFA)でログインし、認証済みの時間割ページ HTML を返す。
 *
 * パースはこのモジュールでは行わず、ChibaTechPortal の検証済み header ベースパーサ
 * (`apps/worker/src/scrapers/timetable-parser.ts` の parseTimetableHtml) に委譲する
 * (曜日をテーブルヘッダから導出し、位置依存の誤曜日化を避けるため。パーサ of record を一本化)。
 *
 * ⚠️ production パスへ配線するときは必ず SCRAPE_ENABLED ゲート下でのみ呼ぶこと
 * (この関数自体はゲートを持たず、呼べば即 SSO ログイン=外部アクセスを実行する)。
 * 現状はどの production パスからも未 import の verify-only。
 *
 * @throws CitPortalError 各ステージで失敗した場合
 */
export async function fetchCitPortalTimetableHtml(
  username: string,
  password: string,
  totpSecret: string,
  totpDeviceName: string | null = null,
): Promise<string> {
  const baseUrl = (process.env.CIT_PORTAL_BASE_URL ?? DEFAULT_BASE).replace(
    /\/$/,
    "",
  );
  if (!username || !password || !totpSecret) {
    throw new CitPortalError(
      "認証情報(ユーザーID/パスワード/TOTPシークレット)が空です",
      "config",
    );
  }
  const jar: HostCookieJar = new Map();
  return login(jar, baseUrl, username, password, totpSecret, totpDeviceName);
}

/**
 * 認証済みセッションの menuForm を menuid 指定で別機能へ遷移し、その HTML を返す。
 * login() の時間割ナビと同じ menuForm POST パターン (Faces-Request ajax は付けない)。
 */
async function navigateMenuById(
  jar: HostCookieJar,
  baseUrl: string,
  currentHtml: string,
  menuid: string,
  viewStateOverride?: string | null,
): Promise<string> {
  const $ = cheerio.load(currentHtml);
  const $menu = $('form#menuForm, form[id$=":menuForm"]').first();
  const fields: Record<string, string> = {};
  $menu.find("input").each((_, el) => {
    const name = $(el).attr("name");
    if (name) fields[name] = $(el).attr("value") ?? "";
  });
  const action = new URL(
    $menu.attr("action") || `${baseUrl}${TIMETABLE_PATH}`,
    baseUrl,
  ).toString();
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(fields)) body.set(k, v);
  // WHY: partial-ajax(検索/詳細)後は ViewState が進む。menuForm に埋まった ViewState は
  // その描画時点のもの(陳腐化し得る)なので、直近レスポンスの最新 ViewState で上書きする。
  if (viewStateOverride) body.set("javax.faces.ViewState", viewStateOverride);
  body.set("menuForm", "menuForm");
  body.set("rx.sync.source", "menuForm:mainMenu");
  body.set("menuForm:mainMenu", "menuForm:mainMenu");
  body.set("menuForm:mainMenu_menuid", menuid);
  const r = await portalFetch(jar, action, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Origin: new URL(action).origin,
      Referer: action,
    },
    body: body.toString(),
  });
  return r.res.text();
}

/**
 * CIT ポータルに SSO ログインし、掲示板 (お知らせ) ページの HTML を返す。
 * パースは notifications-parser.ts (parseCitPortalNotifications) に委譲する。
 *
 * ⚠️ production 配線時は SCRAPE_ENABLED ゲート下でのみ呼ぶこと (login と同じ)。
 */
export async function fetchCitPortalNotificationsHtml(
  username: string,
  password: string,
  totpSecret: string,
  totpDeviceName: string | null = null,
): Promise<string> {
  const baseUrl = (process.env.CIT_PORTAL_BASE_URL ?? DEFAULT_BASE).replace(
    /\/$/,
    "",
  );
  if (!username || !password || !totpSecret) {
    throw new CitPortalError(
      "認証情報(ユーザーID/パスワード/TOTPシークレット)が空です",
      "config",
    );
  }
  const jar: HostCookieJar = new Map();
  // login() で SSO 認証 (時間割ページに着地・menuForm を含む) → 掲示板(0_3_0_0)へ遷移。
  const html = await login(
    jar,
    baseUrl,
    username,
    password,
    totpSecret,
    totpDeviceName,
  );
  return navigateMenuById(jar, baseUrl, html, "0_3_0_0");
}

// ─────────────────────────────────────────
// シラバス照会 (Kmh006) — stateful JSF partial-ajax
// ─────────────────────────────────────────
const SYLLABUS_MENU_ID = "2_0_0_2";

/** partial-response XML から指定 id の <update> CDATA を取り出す。 */
function extractPartialUpdate(xml: string, id: string): string | null {
  const re = new RegExp(
    '<update id="' +
      id.replace(/[:.]/g, "\\$&") +
      '"><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></update>',
  );
  const m = xml.match(re);
  return m ? m[1] : null;
}

/** partial-response XML から更新後の ViewState 値を取り出す。 */
function extractPartialViewState(xml: string): string | null {
  const m = xml.match(
    /<update id="[^"]*ViewState[^"]*"><!\[CDATA\[([\s\S]*?)\]\]><\/update>/,
  );
  return m ? m[1] : null;
}

/** フォーム scope 内の input/select/textarea の現在値を URLSearchParams に集める。 */
function collectFormFields(
  $: cheerio.CheerioAPI,
  $scope: cheerio.Cheerio<AnyNode>,
): URLSearchParams {
  const b = new URLSearchParams();
  $scope.find("input,select,textarea").each((_, el) => {
    const $e = $(el);
    const name = $e.attr("name");
    if (!name || /focus$/.test(name)) return;
    const ty = ($e.attr("type") || "").toLowerCase();
    if (ty === "checkbox" || ty === "radio") {
      if ($e.attr("checked") !== undefined) b.append(name, $e.attr("value") ?? "on");
      return;
    }
    if ((el as { tagName?: string }).tagName === "select") {
      const sel = $e.find("option[selected]").first();
      b.set(name, sel.attr("value") ?? $e.find("option").first().attr("value") ?? "");
      return;
    }
    b.set(name, $e.attr("value") ?? "");
  });
  return b;
}

async function postAjax(
  jar: HostCookieJar,
  action: string,
  referer: string,
  body: URLSearchParams,
): Promise<string> {
  const r = await portalFetch(jar, action, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "Faces-Request": "partial/ajax",
      "X-Requested-With": "XMLHttpRequest",
      Origin: new URL(action).origin,
      Referer: referer,
    },
    body: body.toString(),
  });
  return r.res.text();
}

/**
 * シラバス照会で科目名検索し、先頭ヒットの詳細ページ HTML を返す。ヒット無しは null。
 *
 * WHY: Kmh006 は **stateful JSF** (実 ViewState)。検索は PrimeFaces partial-ajax で
 * funcForm を更新し、詳細クリックは「検索後の更新 funcForm 全状態 + 新 ViewState」を
 * 再送する必要がある (UNIPA はステートレスではなく、毎リクエストで全状態を要求)。
 * 詳細レスポンスは ViewRoot 全体の再描画なので、その HTML を返す。
 *
 * ⚠️ production 配線時は SCRAPE_ENABLED ゲート下でのみ呼ぶこと。
 */
export async function fetchCitSyllabusHtml(
  username: string,
  password: string,
  totpSecret: string,
  totpDeviceName: string | null,
  courseName: string,
): Promise<string | null> {
  const baseUrl = (process.env.CIT_PORTAL_BASE_URL ?? DEFAULT_BASE).replace(/\/$/, "");
  if (!username || !password || !totpSecret) {
    throw new CitPortalError("認証情報が空です", "config");
  }
  if (!courseName.trim()) return null;

  const jar: HostCookieJar = new Map();
  const loginHtml = await login(jar, baseUrl, username, password, totpSecret, totpDeviceName);
  const formHtml = await navigateMenuById(jar, baseUrl, loginHtml, SYLLABUS_MENU_ID);
  return (await searchSyllabusDetail(jar, baseUrl, formHtml, courseName)).html;
}

/**
 * 複数科目のシラバス詳細を **1 回のログイン** でまとめて取得する (sync 用)。
 *
 * WHY: 科目ごとに login() し直すと、同一 30s 窓で同じ TOTP コードを再送して IdP に
 * replay 拒否される。よってセッション(jar)を 1 ログイン分だけ張り、科目ごとに menu から
 * 検索フォームへ再ナビしてフレッシュな funcForm 状態で検索する。
 *
 * ナビ元には「直近に完全レンダリングされたページ」(検索フォーム or 詳細 ViewRoot)を使う。
 * これらは現行 menuForm(有効 ViewState)を含むので、ループでも ViewState が陳腐化しない。
 *
 * 返り値: ユニーク化した科目名ごとの [{ courseName, html|null }] (html=null はヒット無し/失敗)。
 * 1 科目の失敗で全体を止めない (fail-soft)。
 *
 * ⚠️ production 配線時は SCRAPE_ENABLED ゲート下でのみ呼ぶこと。
 */
export async function fetchCitSyllabiForCourses(
  username: string,
  password: string,
  totpSecret: string,
  totpDeviceName: string | null,
  courseNames: string[],
): Promise<Array<{ courseName: string; html: string | null }>> {
  const baseUrl = (process.env.CIT_PORTAL_BASE_URL ?? DEFAULT_BASE).replace(/\/$/, "");
  if (!username || !password || !totpSecret) {
    throw new CitPortalError("認証情報が空です", "config");
  }
  const uniq = [...new Set(courseNames.map((c) => c.trim()).filter(Boolean))];
  const results: Array<{ courseName: string; html: string | null }> = [];
  if (uniq.length === 0) return results;

  const jar: HostCookieJar = new Map();
  const loginHtml = await login(jar, baseUrl, username, password, totpSecret, totpDeviceName);
  // WHY: menuForm の構造(メニューツリー)は不変なので毎回 loginHtml から読む。一方 ViewState は
  // 検索/詳細で進むため、直近レスポンスの最新 ViewState(latestViewState)を menu nav に引き継ぐ。
  // 初回は null = loginHtml 埋め込みの ViewState(ログイン直後で有効)を使う。
  let latestViewState: string | null = null;
  for (const courseName of uniq) {
    try {
      const formHtml = await navigateMenuById(
        jar,
        baseUrl,
        loginHtml,
        SYLLABUS_MENU_ID,
        latestViewState,
      );
      const { html, viewState } = await searchSyllabusDetail(
        jar,
        baseUrl,
        formHtml,
        courseName,
      );
      results.push({ courseName, html });
      // ヒット無しでも検索レスポンスで ViewState は進むので、取れた最新を必ず引き継ぐ。
      if (viewState) latestViewState = viewState;
    } catch (error) {
      // WHY: 1 科目のネットワーク/JSF エラーで全体を落とさない。null で記録し継続。
      console.warn(
        `[cit-syllabus] 科目のシラバス取得に失敗 (継続): ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      results.push({ courseName, html: null });
    }
  }
  return results;
}

/**
 * ログイン済み jar + 検索フォーム HTML で科目名検索 → 先頭ヒットの詳細を取得する。
 * 返り値: { html, viewState }。html はヒット無し時 null、viewState は直近レスポンスの
 * 最新 ViewState(無ければ null)。検索フォームへの(再)ナビは呼び出し側が行う。
 *
 * WHY: Kmh006 は stateful JSF。検索は partial-ajax で funcForm を更新し、詳細クリックは
 * 「検索後の更新 funcForm 全状態 + 新 ViewState」を再送する必要がある。詳細は ViewRoot
 * 全体の再描画。最新 ViewState は呼び出し側が次の menu nav に引き継ぐため返す。
 */
async function searchSyllabusDetail(
  jar: HostCookieJar,
  baseUrl: string,
  formHtml: string,
  courseName: string,
): Promise<{ html: string | null; viewState: string | null }> {
  if (!courseName.trim()) return { html: null, viewState: null };

  const $0 = cheerio.load(formHtml);
  const $form0 = $0('form[id$="funcForm"], form#funcForm').first();
  if ($form0.length === 0) {
    throw new CitPortalError("シラバス検索フォームが見つかりません", "fetch");
  }
  const action = new URL(
    $form0.attr("action") || `${baseUrl}${TIMETABLE_PATH}`,
    baseUrl,
  ).toString();

  // 1) 科目名で検索 (partial-ajax)
  const sb = collectFormFields($0, $form0);
  sb.set("funcForm:jugyoKamoku", courseName);
  sb.set("javax.faces.partial.ajax", "true");
  sb.set("javax.faces.source", "funcForm:search");
  sb.set("javax.faces.partial.execute", "funcForm");
  sb.set("javax.faces.partial.render", "funcForm");
  sb.set("funcForm:search", "funcForm:search");
  const searchXml = await postAjax(jar, action, formHtml, sb);

  const funcHtml = extractPartialUpdate(searchXml, "funcForm");
  const searchViewState = extractPartialViewState(searchXml);
  if (!funcHtml) return { html: null, viewState: searchViewState };

  const $1 = cheerio.load(`<form id="funcForm">${funcHtml}</form>`);
  const $form1 = $1("#funcForm");
  // 先頭ヒットの詳細リンク (無ければ 0 件)
  if ($1('a[id^="funcForm:table:0:"][id$="jugyoKmkName"]').length === 0) {
    return { html: null, viewState: searchViewState };
  }

  // 2) 検索後の全状態 + 新 ViewState で詳細クリック
  const cb = collectFormFields($1, $form1);
  if (searchViewState) cb.set("javax.faces.ViewState", searchViewState);
  cb.set("javax.faces.partial.ajax", "true");
  cb.set("javax.faces.source", "funcForm:table:0:jugyoKmkName");
  cb.set("javax.faces.partial.execute", "@all");
  cb.set("javax.faces.partial.render", "@all");
  cb.set("funcForm:table:0:jugyoKmkName", "funcForm:table:0:jugyoKmkName");
  const detailXml = await postAjax(jar, action, formHtml, cb);

  if (detailXml.includes("Error Page")) {
    throw new CitPortalError("シラバス詳細取得でエラーページが返りました", "fetch");
  }
  // 詳細は ViewRoot 全体の再描画。最新 ViewState は別 update ノードで届くのでそれを返す。
  const detailViewState = extractPartialViewState(detailXml) ?? searchViewState;
  const html = extractPartialUpdate(detailXml, "javax.faces.ViewRoot") ?? detailXml;
  return { html, viewState: detailViewState };
}
