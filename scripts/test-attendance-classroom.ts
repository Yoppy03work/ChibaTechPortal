/**
 * 出席システム 教室URL解析
 *
 * /attendance/class_room/{roomId} のフローを完全解析する。
 * CIT_Wi-Fi接続状態で実行してください。
 *
 * 実行: npx tsx scripts/test-attendance-classroom.ts
 */

const CLASSROOM_URL = 'https://attendance.is.it-chiba.ac.jp/attendance/class_room/8109';
const LOGIN_URL = 'https://attendance.is.it-chiba.ac.jp/attendance/login';

const USER_AGENT = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15';

async function traceRedirects(url: string) {
  console.log(`\n=== ${url} ===`);
  let currentUrl = url;
  let cookies: Record<string, string> = {};
  let step = 0;

  while (step < 10) {
    step++;
    const resp = await fetch(currentUrl, {
      redirect: 'manual',
      headers: {
        'User-Agent': USER_AGENT,
        Cookie: Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; '),
      },
      signal: AbortSignal.timeout(10000),
    });

    console.log(`\n[Step ${step}] ${resp.status} ${currentUrl}`);

    // Cookie収集
    const setCookies = resp.headers.getSetCookie?.() ?? [];
    for (const sc of setCookies) {
      const [pair] = sc.split(';');
      if (pair) {
        const eq = pair.indexOf('=');
        if (eq > 0) {
          cookies[pair.substring(0, eq).trim()] = pair.substring(eq + 1).trim();
        }
      }
    }
    if (setCookies.length > 0) {
      console.log(`  Set-Cookie: ${setCookies.map(c => c.split(';')[0]).join(', ')}`);
    }

    // リダイレクト追跡
    if (resp.status >= 300 && resp.status < 400) {
      const location = resp.headers.get('location') || '';
      console.log(`  -> ${location}`);
      currentUrl = new URL(location, currentUrl).toString();
      continue;
    }

    // ボディ解析
    const body = await resp.text();
    console.log(`  Content-Type: ${resp.headers.get('content-type')}`);
    console.log(`  Body size: ${body.length} bytes`);
    console.log(`  Title: ${body.match(/<title>(.*?)<\/title>/)?.[1] || '(なし)'}`);

    // フォーム解析
    const formMatches = body.matchAll(/<form[^>]*>([\s\S]*?)<\/form>/gi);
    for (const match of formMatches) {
      const formTag = match[0].match(/<form[^>]*>/)?.[0] || '';
      console.log(`\n  フォーム: ${formTag}`);

      const inputs = match[0].matchAll(/<input[^>]*>/gi);
      for (const input of inputs) {
        const name = input[0].match(/name="([^"]*)"/)?.[1] || '';
        const type = input[0].match(/type="([^"]*)"/)?.[1] || 'text';
        const value = input[0].match(/value="([^"]*)"/)?.[1] || '';
        console.log(`    [${type}] ${name} = "${value.substring(0, 50)}"`);
      }

      const buttons = match[0].matchAll(/<button[^>]*>([\s\S]*?)<\/button>/gi);
      for (const btn of buttons) {
        const name = btn[0].match(/name="([^"]*)"/)?.[1] || '';
        const text = btn[1]?.trim() || '';
        console.log(`    [button] ${name} "${text}"`);
      }
    }

    // リンク
    const links = body.matchAll(/<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi);
    const linkList = [...links];
    if (linkList.length > 0) {
      console.log(`\n  リンク:`);
      for (const link of linkList) {
        console.log(`    "${link[2]?.trim().substring(0, 40)}" -> ${link[1]}`);
      }
    }

    // 重要なテキスト
    const alertMessages = body.matchAll(/class="[^"]*(?:alert|error|message|info)[^"]*"[^>]*>([\s\S]*?)</gi);
    for (const msg of alertMessages) {
      const text = msg[1]?.replace(/<[^>]*>/g, '').trim();
      if (text) console.log(`  メッセージ: "${text}"`);
    }

    // 全HTML（コンパクトに）
    console.log(`\n  --- HTML全文 ---`);
    console.log(body);
    console.log(`  --- END ---`);

    break;
  }

  return cookies;
}

async function main() {
  console.log('出席システム教室URL解析');
  console.log(`実行日時: ${new Date().toLocaleString('ja-JP')}`);

  // 1. 教室URLに直接アクセス（未認証）
  console.log('\n\n========== 1. 教室URLに未認証でアクセス ==========');
  await traceRedirects(CLASSROOM_URL);

  // 2. ログインページ
  console.log('\n\n========== 2. ログインページ ==========');
  await traceRedirects(LOGIN_URL);

  console.log('\n\n=== 分析結果 ===');
  console.log('教室URL: /attendance/class_room/{roomId}');
  console.log('roomId例: 8109');
  console.log('このURLはQRコードに埋め込まれている');
}

main().catch(console.error);
