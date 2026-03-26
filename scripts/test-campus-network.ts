/**
 * キャンパスネットワーク実測テスト
 *
 * CIT_Wi-Fi接続状態で実行してください。
 * 出席システムの到達性 + IP情報 + 各システムの応答を調査します。
 *
 * 実行: npx tsx scripts/test-campus-network.ts
 */

const TARGETS = [
  {
    name: '出席システム',
    url: 'https://attendance.is.it-chiba.ac.jp/attendance/qr_again',
    critical: true,
  },
  {
    name: '出席システム (トップ)',
    url: 'https://attendance.is.it-chiba.ac.jp/',
    critical: true,
  },
  {
    name: 'CIT Portal',
    url: 'https://portal.it-chiba.ac.jp/uprx/',
    critical: false,
  },
  {
    name: 'manaba',
    url: 'https://cit.manaba.jp/ct/home',
    critical: false,
  },
] as const;

interface NetworkResult {
  name: string;
  url: string;
  reachable: boolean;
  statusCode: number | null;
  redirectUrl: string | null;
  responseTimeMs: number;
  headers: Record<string, string>;
  bodyPreview: string;
  error: string | null;
}

async function testTarget(target: typeof TARGETS[number]): Promise<NetworkResult> {
  const start = Date.now();
  const result: NetworkResult = {
    name: target.name,
    url: target.url,
    reachable: false,
    statusCode: null,
    redirectUrl: null,
    responseTimeMs: 0,
    headers: {},
    bodyPreview: '',
    error: null,
  };

  try {
    const resp = await fetch(target.url, {
      redirect: 'manual',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      signal: AbortSignal.timeout(10000),
    });

    result.responseTimeMs = Date.now() - start;
    result.reachable = true;
    result.statusCode = resp.status;

    if (resp.status >= 300 && resp.status < 400) {
      result.redirectUrl = resp.headers.get('location');
    }

    resp.headers.forEach((value, key) => {
      result.headers[key] = value;
    });

    const body = await resp.text();
    result.bodyPreview = body.substring(0, 1000);

  } catch (err) {
    result.responseTimeMs = Date.now() - start;
    result.error = err instanceof Error ? err.message : String(err);
  }

  return result;
}

async function getNetworkInfo() {
  console.log('=== ネットワーク情報 ===');

  // グローバルIP取得
  try {
    const resp = await fetch('https://api.ipify.org?format=json', {
      signal: AbortSignal.timeout(5000),
    });
    const data = await resp.json() as { ip: string };
    console.log(`グローバルIP: ${data.ip}`);
  } catch {
    console.log('グローバルIP: 取得失敗');
  }

  // DNS解決テスト
  const dns = await import('node:dns').then(m => m.promises);
  try {
    const addrs = await dns.resolve4('attendance.is.it-chiba.ac.jp');
    console.log(`出席システムIP: ${addrs.join(', ')}`);
  } catch (err) {
    console.log(`出席システムDNS: 解決失敗 (${err instanceof Error ? err.message : err})`);
  }

  try {
    const addrs = await dns.resolve4('portal.it-chiba.ac.jp');
    console.log(`CIT Portal IP: ${addrs.join(', ')}`);
  } catch {
    console.log('CIT Portal DNS: 解決失敗');
  }
}

function printResult(r: NetworkResult) {
  const status = r.reachable ? 'OK' : 'NG';
  const icon = r.reachable ? '[OK]' : '[NG]';

  console.log(`\n--- ${icon} ${r.name} ---`);
  console.log(`  URL: ${r.url}`);
  console.log(`  到達: ${status} (${r.responseTimeMs}ms)`);

  if (r.statusCode !== null) {
    console.log(`  HTTP: ${r.statusCode}`);
  }
  if (r.redirectUrl) {
    console.log(`  リダイレクト先: ${r.redirectUrl}`);
  }
  if (r.error) {
    console.log(`  エラー: ${r.error}`);
  }

  // 重要ヘッダー
  const importantHeaders = ['server', 'content-type', 'set-cookie', 'x-frame-options'];
  for (const h of importantHeaders) {
    if (r.headers[h]) {
      console.log(`  ${h}: ${r.headers[h].substring(0, 100)}`);
    }
  }

  if (r.bodyPreview) {
    console.log(`  ボディ先頭300文字:`);
    console.log(`  ${r.bodyPreview.substring(0, 300).replace(/\n/g, '\n  ')}`);
  }
}

async function main() {
  console.log('ChibaTechPortal キャンパスネットワーク実測テスト');
  console.log(`実行日時: ${new Date().toLocaleString('ja-JP')}`);
  console.log('CIT_Wi-Fiに接続していることを確認してください\n');

  await getNetworkInfo();

  console.log('\n=== 各システム到達性テスト ===');

  const results: NetworkResult[] = [];
  for (const target of TARGETS) {
    console.log(`\nテスト中: ${target.name}...`);
    const result = await testTarget(target);
    results.push(result);
    printResult(result);
  }

  // サマリー
  console.log('\n\n=== サマリー ===');
  console.log('| システム | 到達 | HTTP | 応答時間 |');
  console.log('|----------|------|------|----------|');
  for (const r of results) {
    const status = r.reachable ? 'OK' : 'NG';
    const http = r.statusCode ?? 'N/A';
    console.log(`| ${r.name} | ${status} | ${http} | ${r.responseTimeMs}ms |`);
  }

  const attendanceReachable = results
    .filter(r => r.name.includes('出席'))
    .some(r => r.reachable);

  console.log(`\n出席システム到達性: ${attendanceReachable ? 'CIT_Wi-Fiからアクセス可能' : 'アクセス不可（学外の可能性）'}`);
  console.log('\nこの結果を設計書セクション7・10に反映してください');
}

main().catch(console.error);
