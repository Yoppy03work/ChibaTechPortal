import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // WHY: dev インジケータ（左下バッジ）がモバイル幅で固定ボトムナビの
  // 「ホーム」タブに重なり、E2E のクリックを恒常的に遮るため無効化する。
  // dev 専用 UI なので本番ビルドには影響しない。
  devIndicators: false,
};

export default nextConfig;
