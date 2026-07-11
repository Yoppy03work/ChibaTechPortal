import './globals.css';
import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';
import { RegisterSW } from '@/components/register-sw';
import { ThemeProvider } from '@/components/theme-provider';
import { fontVariables } from './fonts';

export const metadata: Metadata = {
  title: 'ChibaTech Portal',
  description: '千葉工業大学 統合ポータル PWA',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'CTP',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // WHY: モノクロ配色に合わせ、ライト/ダークでブラウザUI色を切り替える
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F3F4F4' },
    { media: '(prefers-color-scheme: dark)', color: '#0B0C0D' },
  ],
};

/**
 * WHY: React hydration より前に data-theme と文字サイズを確定させ FOUC を防ぐ。
 * CSP は strict-dynamic なので nonce 付きインラインスクリプトのみ許可される。
 */
const THEME_BOOT = `(function(){try{var t=localStorage.getItem('ctp-theme');if(t!=='dark'&&t!=='light'){t=(window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches)?'dark':'light';}document.documentElement.setAttribute('data-theme',t);var f=localStorage.getItem('ctp-font-scale');if(f){document.documentElement.style.setProperty('--ctp-font-scale',f);}}catch(e){}})();`;

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const nonce = (await headers()).get('x-nonce') ?? undefined;

  return (
    <html lang="ja" className={fontVariables} suppressHydrationWarning>
      <head>
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
        {/* WHY: ブラウザは使用後に nonce 属性値を DOM から隠す（空になる）ため、
            サーバー(実nonce)とクライアント(空)でハイドレーション不一致の警告が出る。
            スクリプトは既に実行済みで再実行されないので、この要素だけ警告を抑制する。 */}
        <script nonce={nonce} suppressHydrationWarning dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
      </head>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
        <RegisterSW />
      </body>
    </html>
  );
}
