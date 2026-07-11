/**
 * next/font によるフォント self-host。
 *
 * WHY: ポータルの CSP は font-src 'self' のため Google Fonts CDN を直接読めない。
 * next/font/google はビルド時にフォントを同一オリジンへ取り込むので CSP に適合する。
 * それぞれ CSS 変数を公開し、globals.css の --font-sans/--font-jp/--font-mono が束ねる。
 */
import { Lexend, JetBrains_Mono, Zen_Kaku_Gothic_New } from 'next/font/google';

// 英字・数字の見出し／本文（設計の主フォント）
export const lexend = Lexend({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-lexend',
  display: 'swap',
});

// 数字・時刻・コード（等幅）
export const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '700'],
  variable: '--font-mono-raw',
  display: 'swap',
});

// 日本語（本文・見出し）。日本語サブセットは大きいため preload しない。
export const zenKaku = Zen_Kaku_Gothic_New({
  subsets: ['latin'],
  weight: ['400', '500', '700'],
  variable: '--font-zen',
  display: 'swap',
  preload: false,
});

// <html> に付与する全フォント変数クラス
export const fontVariables = `${lexend.variable} ${jetbrainsMono.variable} ${zenKaku.variable}`;
