'use client';

/**
 * アプリ共通ヘッダー（設計の phone 内ヘッダー相当）。
 *
 * WHY: 設計では画面ごとに subtitle + title を出し、右にお知らせベルとアバターを置く。
 * 本アプリではルートから title/subtitle を導出する。テーマ切替は設計だと設定画面配下だが、
 * コア段階では設定未実装のためヘッダーにコンパクトなトグルを併設する。
 */
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTheme } from './theme-provider';
import { metaFor } from '@/lib/nav-meta';
import { useNowText } from './use-now-text';

const circleBtn: React.CSSProperties = {
  position: 'relative',
  width: 38,
  height: 38,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: 999,
  border: '1px solid var(--line)',
  background: 'var(--surface)',
  color: 'var(--ink-2)',
  boxShadow: 'var(--shadow-sm)',
};

export function AppHeader({ studentId = '' }: { studentId?: string }) {
  const pathname = usePathname();
  const { theme, toggleTheme } = useTheme();
  const meta = metaFor(pathname);
  const nowText = useNowText();
  // WHY: ホームは年月日+ライブ時計を表示（マウント前は静的な日付でフォールバック）
  const subtitle = pathname === '/' && nowText ? nowText : meta.subtitle;
  const title = meta.title;
  const dark = theme === 'dark';
  // WHY: 氏名は DB に無いため学籍番号の頭文字をアバターに使う
  const avatarChar = studentId ? studentId.charAt(0).toUpperCase() : '学';

  return (
    <header
      className="ctp-mobile-only"
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 20,
        flex: 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 10,
        padding: 'calc(8px + env(safe-area-inset-top)) 16px 8px',
        background: 'var(--bg)',
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontSize: 11.5,
            color: 'var(--ink-3)',
            fontWeight: 500,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {subtitle}
        </div>
        <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-.02em', marginTop: 1 }}>
          {title}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 'none' }}>
        <button
          type="button"
          onClick={toggleTheme}
          aria-label={dark ? 'ライトモードに切り替え' : 'ダークモードに切り替え'}
          style={{ ...circleBtn }}
        >
          {dark ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="4" />
              <path d="M12 3v2M12 19v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M3 12h2M19 12h2M4.6 19.4l1.4-1.4M18 6l1.4-1.4" />
            </svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
              <path d="M20.5 14A8.2 8.2 0 1 1 10 3.5 6.4 6.4 0 0 0 20.5 14Z" />
            </svg>
          )}
        </button>

        <Link href="/notifications" aria-label="お知らせ" style={{ ...circleBtn, textDecoration: 'none' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 9a6 6 0 1 1 12 0c0 4 1.5 5.5 2 6H4c.5-.5 2-2 2-6z" />
            <path d="M10 20a2 2 0 0 0 4 0" />
          </svg>
          <span
            style={{
              position: 'absolute',
              top: 8,
              right: 9,
              width: 8,
              height: 8,
              borderRadius: 999,
              background: 'var(--ink)',
              border: '2px solid var(--surface)',
            }}
          />
        </Link>

        <div
          aria-hidden="true"
          style={{
            width: 38,
            height: 38,
            borderRadius: 999,
            background: 'linear-gradient(135deg,#2A2D31,#15171A)',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: 'var(--font-jp)',
            fontWeight: 700,
            fontSize: 14,
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          {avatarChar}
        </div>
      </div>
    </header>
  );
}
