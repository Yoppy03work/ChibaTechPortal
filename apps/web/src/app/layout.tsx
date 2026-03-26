import type { Metadata, Viewport } from 'next';
import { RegisterSW } from '@/components/register-sw';

export const metadata: Metadata = {
  title: 'ChibaTechPortal',
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
  themeColor: '#1E3A5F',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <head>
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
      </head>
      <body className="min-h-screen bg-[#FAFAFA] text-[#0A0A0A]">
        {children}
        <RegisterSW />
      </body>
    </html>
  );
}
