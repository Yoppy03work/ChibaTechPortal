'use client';

/**
 * 3Dキャンパスマップ ページ。
 * WHY: three.js はブラウザ専用なので ssr:false で client のみ読み込む。
 */
import dynamic from 'next/dynamic';

const Campus3DMap = dynamic(() => import('@/components/campus-3d-map'), {
  ssr: false,
  loading: () => (
    <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center', color: '#1E3A5F' }}>
      3Dマップを読み込み中…
    </div>
  ),
});

export default function MapPage() {
  return <Campus3DMap />;
}
