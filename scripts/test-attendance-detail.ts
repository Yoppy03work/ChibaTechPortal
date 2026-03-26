/**
 * 出席システム詳細解析
 *
 * /qr_again のHTML構造、フォーム、hidden fields、認証方式を調査する。
 * CIT_Wi-Fi接続状態で実行してください。
 *
 * 実行: npx tsx scripts/test-attendance-detail.ts
 */

const ATTENDANCE_URLS = [
  'https://attendance.is.it-chiba.ac.jp/attendance/qr_again',
  'https://attendance.is.it-chiba.ac.jp/attendance/',
  'https://attendance.is.it-chiba.ac.jp/attendance/login',
  'https://attendance.is.it-chiba.ac.jp/attendance/submit',
] as const;

const USER_AGENT = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

async function analyzeUrl(url: string) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`URL: ${url}`);
  console.log('='.repeat(60));

  try {
    // リダイレクトを追跡
    let currentUrl = url;
    let redirectCount = 0;

    while (redirectCount < 5) {
      const resp = await fetch(currentUrl, {
        redirect: 'manual',
        headers: { 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(10000),
      });

      console.log(`\n[${resp.status}] ${currentUrl}`);

      // ヘッダー全出力
      console.log('\nレスポンスヘッダー:');
      resp.headers.forEach((value, key) => {
        console.log(`  ${key}: ${value}`);
      });

      if (resp.status >= 300 && resp.status < 400) {
        const location = resp.headers.get('location') || '';
        console.log(`  -> リダイレクト先: ${location}`);
        currentUrl = new URL(location, currentUrl).toString();
        redirectCount++;
        continue;
      }

      // ボディ解析
      const body = await resp.text();
      console.log(`\nボディサイズ: ${body.length} bytes`);

      // HTML全文出力（2000文字まで）
      console.log(`\nHTML (先頭2000文字):`);
      console.log(body.substring(0, 2000));

      // cheerioで解析
      try {
        const { load } = await import('cheerio');
        const $ = load(body);

        // タイトル
        console.log(`\nページタイトル: ${$('title').text().trim()}`);

        // フォーム
        const forms = $('form');
        console.log(`\nフォーム数: ${forms.length}`);
        forms.each((i, form) => {
          const $form = $(form);
          console.log(`\n  フォーム ${i + 1}:`);
          console.log(`    action: ${$form.attr('action') || '(なし)'}`);
          console.log(`    method: ${$form.attr('method') || '(なし)'}`);
          console.log(`    id: ${$form.attr('id') || '(なし)'}`);
          console.log(`    name: ${$form.attr('name') || '(なし)'}`);
        });

        // 全input要素
        const inputs = $('input');
        console.log(`\nInput要素: ${inputs.length}個`);
        inputs.each((_, el) => {
          const $el = $(el);
          const type = $el.attr('type') || 'text';
          const name = $el.attr('name') || '(unnamed)';
          const value = $el.attr('value') || '';
          const id = $el.attr('id') || '';
          console.log(`  [${type}] name="${name}" value="${value.substring(0, 50)}" id="${id}"`);
        });

        // select要素
        const selects = $('select');
        if (selects.length > 0) {
          console.log(`\nSelect要素: ${selects.length}個`);
          selects.each((_, el) => {
            const $el = $(el);
            console.log(`  name="${$el.attr('name')}" id="${$el.attr('id')}"`);
            $el.find('option').each((_, opt) => {
              console.log(`    option: value="${$(opt).attr('value')}" text="${$(opt).text().trim()}"`);
            });
          });
        }

        // リンク
        const links = $('a[href]');
        console.log(`\nリンク: ${links.length}個`);
        links.each((_, el) => {
          const href = $(el).attr('href') || '';
          const text = $(el).text().trim();
          if (text || href) {
            console.log(`  [${text.substring(0, 30)}] -> ${href.substring(0, 80)}`);
          }
        });

        // script src
        const scripts = $('script[src]');
        if (scripts.length > 0) {
          console.log(`\n外部スクリプト: ${scripts.length}個`);
          scripts.each((_, el) => {
            console.log(`  ${$(el).attr('src')}`);
          });
        }

        // meta
        $('meta').each((_, el) => {
          const name = $(el).attr('name') || $(el).attr('property') || '';
          const content = $(el).attr('content') || '';
          if (name && content) {
            console.log(`  meta[${name}]: ${content.substring(0, 60)}`);
          }
        });

      } catch {
        console.log('(cheerio解析スキップ)');
      }

      break;
    }
  } catch (err) {
    console.log(`エラー: ${err instanceof Error ? err.message : err}`);
  }
}

async function main() {
  console.log('出席システム詳細解析');
  console.log(`実行日時: ${new Date().toLocaleString('ja-JP')}`);
  console.log('CIT_Wi-Fi接続確認済み\n');

  for (const url of ATTENDANCE_URLS) {
    await analyzeUrl(url);
  }

  console.log('\n\n=== 次のアクション ===');
  console.log('1. QRコードを読み取ってURLパターンを記録する');
  console.log('2. DevToolsでネットワークリクエストをキャプチャする');
  console.log('3. 結果をこのチャットに貼り付けてください');
}

main().catch(console.error);
