/**
 * QRコード画像デコードスクリプト
 *
 * 教室QRコードの写真からURLを抽出する。
 * 実行: npx tsx scripts/decode-qr.ts
 */
import sharp from 'sharp';
import jsQR from 'jsqr';
import path from 'path';

const IMAGES = [
  '/tmp/img_0209.jpg',
  '/tmp/img_0210.jpg',
  '/tmp/img_0211.jpg',
];

async function decodeQR(imagePath: string): Promise<string | null> {
  // 複数の前処理を試す
  const attempts = [
    // そのまま
    { resize: undefined, threshold: undefined, invert: false },
    // リサイズ
    { resize: 800, threshold: undefined, invert: false },
    // 二値化
    { resize: 800, threshold: 128, invert: false },
    // 反転+二値化
    { resize: 800, threshold: 128, invert: true },
    // 大きめリサイズ
    { resize: 1200, threshold: undefined, invert: false },
    // コントラスト強調
    { resize: 800, threshold: 100, invert: false },
  ];

  for (const attempt of attempts) {
    try {
      let pipeline = sharp(imagePath).grayscale();

      if (attempt.resize) {
        pipeline = pipeline.resize(attempt.resize);
      }
      if (attempt.invert) {
        pipeline = pipeline.negate();
      }
      if (attempt.threshold) {
        pipeline = pipeline.threshold(attempt.threshold);
      }

      const { data, info } = await pipeline
        .raw()
        .toBuffer({ resolveWithObject: true });

      const code = jsQR(
        new Uint8ClampedArray(data),
        info.width,
        info.height,
      );

      if (code) {
        return code.data;
      }
    } catch {
      // 次の方法を試す
    }
  }
  return null;
}

async function main() {
  console.log('QRコードデコード');
  console.log('='.repeat(50));

  const results: Array<{ file: string; url: string | null }> = [];

  for (const img of IMAGES) {
    const filename = path.basename(img);
    console.log(`\nデコード中: ${filename}...`);

    const decoded = await decodeQR(img);
    results.push({ file: filename, url: decoded });

    if (decoded) {
      console.log(`  URL: ${decoded}`);

      // URL解析
      try {
        const url = new URL(decoded);
        console.log(`  ホスト: ${url.hostname}`);
        console.log(`  パス: ${url.pathname}`);
        console.log(`  パラメータ:`);
        url.searchParams.forEach((value, key) => {
          console.log(`    ${key} = ${value}`);
        });
      } catch {
        console.log(`  (URL形式ではない: ${decoded})`);
      }
    } else {
      console.log('  デコード失敗');
    }
  }

  // サマリー
  console.log('\n\n=== サマリー ===');
  const decoded = results.filter(r => r.url);
  console.log(`デコード成功: ${decoded.length}/${results.length}`);

  if (decoded.length > 0) {
    console.log('\nURLパターン分析:');
    for (const r of decoded) {
      console.log(`  ${r.file}: ${r.url}`);
    }

    // パターン推定
    const urls = decoded.map(r => new URL(r.url!));
    const commonHost = urls[0]?.hostname;
    const commonPath = urls[0]?.pathname;
    console.log(`\n推定パターン:`);
    console.log(`  ベースURL: https://${commonHost}${commonPath}`);
    console.log(`  パラメータ: ${[...urls[0]!.searchParams.keys()].join(', ')}`);
  }
}

main().catch(console.error);
