/**
 * QRコードデコード（回転・クロップ付き）
 *
 * 天井写真は角度がついているため、回転・トリミング・コントラスト強調を試す。
 */
import sharp from 'sharp';
import jsQR from 'jsqr';
import path from 'path';

const IMAGES = [
  '/tmp/img_0209.jpg',
  '/tmp/img_0210.jpg',
  '/tmp/img_0211.jpg',
];

async function tryDecode(buffer: Buffer, width: number, height: number): Promise<string | null> {
  const code = jsQR(new Uint8ClampedArray(buffer), width, height);
  return code?.data ?? null;
}

async function decodeWithRotations(imagePath: string): Promise<string | null> {
  const rotations = [0, 90, 180, 270, 45, 135, 225, 315];
  const sizes = [600, 800, 1000, 1500];

  for (const size of sizes) {
    for (const rotation of rotations) {
      try {
        const { data, info } = await sharp(imagePath)
          .rotate(rotation)
          .resize(size)
          .grayscale()
          .normalise()  // コントラスト自動補正
          .sharpen()
          .raw()
          .toBuffer({ resolveWithObject: true });

        const result = await tryDecode(data, info.width, info.height);
        if (result) {
          console.log(`    (成功: size=${size}, rotation=${rotation})`);
          return result;
        }

        // 二値化も試す
        const { data: data2, info: info2 } = await sharp(imagePath)
          .rotate(rotation)
          .resize(size)
          .grayscale()
          .normalise()
          .threshold(128)
          .raw()
          .toBuffer({ resolveWithObject: true });

        const result2 = await tryDecode(data2, info2.width, info2.height);
        if (result2) {
          console.log(`    (成功: size=${size}, rotation=${rotation}, threshold)`);
          return result2;
        }
      } catch {
        // continue
      }
    }
  }

  // 中央クロップも試す
  for (const rotation of [0, 90, 180, 270]) {
    try {
      const meta = await sharp(imagePath).metadata();
      const w = meta.width ?? 1000;
      const h = meta.height ?? 1000;
      const cropSize = Math.min(w, h) * 0.7;

      const { data, info } = await sharp(imagePath)
        .extract({
          left: Math.floor((w - cropSize) / 2),
          top: Math.floor((h - cropSize) / 2),
          width: Math.floor(cropSize),
          height: Math.floor(cropSize),
        })
        .rotate(rotation)
        .resize(800)
        .grayscale()
        .normalise()
        .sharpen()
        .raw()
        .toBuffer({ resolveWithObject: true });

      const result = await tryDecode(data, info.width, info.height);
      if (result) {
        console.log(`    (成功: center-crop, rotation=${rotation})`);
        return result;
      }
    } catch {
      // continue
    }
  }

  return null;
}

async function main() {
  console.log('QRコードデコード（回転・補正付き）');
  console.log('='.repeat(50));

  for (const img of IMAGES) {
    const filename = path.basename(img);
    console.log(`\n${filename}:`);

    const decoded = await decodeWithRotations(img);
    if (decoded) {
      console.log(`  URL: ${decoded}`);
      try {
        const url = new URL(decoded);
        console.log(`  ホスト: ${url.hostname}`);
        console.log(`  パス: ${url.pathname}`);
        url.searchParams.forEach((value, key) => {
          console.log(`  パラメータ: ${key} = ${value}`);
        });
      } catch {
        console.log(`  (URL形式ではない)`);
      }
    } else {
      console.log('  全パターンでデコード失敗');
      console.log('  -> スマホのカメラアプリでQRを読み取って、');
      console.log('     表示されたURLをこのチャットに貼ってください');
    }
  }
}

main().catch(console.error);
