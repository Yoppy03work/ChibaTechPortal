/**
 * 出席システム ログインフロー実測
 *
 * 実際にログインして、ログイン後の画面を確認する。
 * CIT_Wi-Fi接続状態で実行してください。
 *
 * 実行: npx tsx scripts/test-attendance-login.ts
 *
 * 注意: 学籍番号とパスワードを引数で渡してください
 * npx tsx scripts/test-attendance-login.ts <学籍番号> <パスワード>
 */

const CLASSROOM_URL = 'https://attendance.is.it-chiba.ac.jp/attendance/class_room/8109';
const LOGIN_URL = 'https://attendance.is.it-chiba.ac.jp/attendance/login';
const BASE_URL = 'https://attendance.is.it-chiba.ac.jp';

const USER_AGENT = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15';

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

async function main() {
  const [,, username, password] = process.argv;

  if (!username || !password) {
    console.log('使い方: npx tsx scripts/test-attendance-login.ts <学籍番号> <パスワード>');
    console.log('');
    console.log('注意: パスワードはプロセス引数に残ります。テスト後にターミナル履歴をクリアしてください。');
    process.exit(1);
  }

  console.log('出席システム ログインフロー実測');
  console.log(`実行日時: ${new Date().toLocaleString('ja-JP')}`);
  console.log(`ユーザー: ${username}`);
  console.log('');

  let cookies: Record<string, string> = {};

  // Step 1: 教室URLにアクセス → ログインにリダイレクト
  console.log('=== Step 1: 教室URLアクセス ===');
  const step1 = await fetch(CLASSROOM_URL, {
    redirect: 'manual',
    headers: { 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(10000),
  });
  console.log(`[${step1.status}] ${CLASSROOM_URL}`);
  cookies = { ...cookies, ...extractCookies(step1.headers) };
  const redirectTo = step1.headers.get('location') || '';
  console.log(`リダイレクト先: ${redirectTo}`);
  console.log(`JSESSIONID: ${cookies['JSESSIONID'] || '(なし)'}`);

  // Step 2: ログインページ取得 → _csrf取得
  console.log('\n=== Step 2: ログインページ取得 ===');
  const loginPageUrl = new URL(redirectTo, BASE_URL).toString();
  const step2 = await fetch(loginPageUrl, {
    headers: {
      'User-Agent': USER_AGENT,
      Cookie: cookieHeader(cookies),
    },
    signal: AbortSignal.timeout(10000),
  });
  console.log(`[${step2.status}] ${loginPageUrl}`);
  cookies = { ...cookies, ...extractCookies(step2.headers) };

  const loginHtml = await step2.text();
  const csrfMatch = loginHtml.match(/name="_csrf"\s+value="([^"]*)"/);
  const csrf = csrfMatch?.[1] || '';
  console.log(`_csrf: ${csrf.substring(0, 30)}...`);

  // Step 3: ログインPOST
  console.log('\n=== Step 3: ログインPOST ===');
  const step3 = await fetch(LOGIN_URL, {
    method: 'POST',
    redirect: 'manual',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': USER_AGENT,
      Cookie: cookieHeader(cookies),
    },
    body: new URLSearchParams({
      _csrf: csrf,
      username,
      password,
      keeplogin: 'on',
    }),
    signal: AbortSignal.timeout(10000),
  });
  console.log(`[${step3.status}]`);
  cookies = { ...cookies, ...extractCookies(step3.headers) };

  // ヘッダー全出力
  console.log('レスポンスヘッダー:');
  step3.headers.forEach((v, k) => console.log(`  ${k}: ${v}`));

  // リダイレクト追跡
  if (step3.status >= 300 && step3.status < 400) {
    const loc = step3.headers.get('location') || '';
    console.log(`\nリダイレクト先: ${loc}`);

    // Step 4: リダイレクト先にアクセス
    console.log('\n=== Step 4: ログイン後のページ ===');
    const step4Url = new URL(loc, BASE_URL).toString();
    const step4 = await fetch(step4Url, {
      redirect: 'manual',
      headers: {
        'User-Agent': USER_AGENT,
        Cookie: cookieHeader(cookies),
      },
      signal: AbortSignal.timeout(10000),
    });
    console.log(`[${step4.status}] ${step4Url}`);
    cookies = { ...cookies, ...extractCookies(step4.headers) };

    if (step4.status >= 300 && step4.status < 400) {
      const loc2 = step4.headers.get('location') || '';
      console.log(`さらにリダイレクト: ${loc2}`);

      const step5Url = new URL(loc2, BASE_URL).toString();
      const step5 = await fetch(step5Url, {
        headers: {
          'User-Agent': USER_AGENT,
          Cookie: cookieHeader(cookies),
        },
        signal: AbortSignal.timeout(10000),
      });
      console.log(`\n[${step5.status}] ${step5Url}`);
      const body5 = await step5.text();
      console.log(`Title: ${body5.match(/<title>(.*?)<\/title>/)?.[1]}`);
      console.log(`Body size: ${body5.length}`);
      console.log('\n--- HTML全文 ---');
      console.log(body5);
    } else {
      const body4 = await step4.text();
      console.log(`Title: ${body4.match(/<title>(.*?)<\/title>/)?.[1]}`);
      console.log(`Body size: ${body4.length}`);
      console.log('\n--- HTML全文 ---');
      console.log(body4);
    }
  } else {
    // リダイレクトなし（200 or エラー）
    const body3 = await step3.text();
    console.log(`Title: ${body3.match(/<title>(.*?)<\/title>/)?.[1]}`);
    console.log(`Body size: ${body3.length}`);
    console.log('\n--- HTML全文 ---');
    console.log(body3);
  }

  // WHY: パスワードがメモリに残る期間を最小化
  console.log('\n完了。ターミナル履歴のクリアを推奨: history -c');
}

main().catch(console.error);
