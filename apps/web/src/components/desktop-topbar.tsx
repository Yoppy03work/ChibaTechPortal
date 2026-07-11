'use client';

/**
 * デスクトップ上部バー（設計 Web 版の header）。
 * タイトル/サブタイトル（ルート由来）＋検索＋お知らせ＋テーマ切替。CSS で PC 幅のみ表示。
 */
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTheme } from './theme-provider';
import { metaFor } from '@/lib/nav-meta';

export function DesktopTopbar() {
  const pathname = usePathname();
  const { theme, toggleTheme } = useTheme();
  const { title, subtitle } = metaFor(pathname);
  const dark = theme === 'dark';

  const iconBtn: React.CSSProperties = {
    position: 'relative',
    width: 40,
    height: 40,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 11,
    border: '1px solid var(--line)',
    background: 'var(--surface)',
    color: 'var(--ink-2)',
    textDecoration: 'none',
  };

  return (
    <header
      className="ctp-topbar"
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 20,
        flex: 'none',
        height: 68,
        borderBottom: '1px solid var(--line)',
        background: 'var(--surface)',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 18,
        padding: '0 26px',
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-.01em', lineHeight: 1.15 }}>{title}</div>
        <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 1 }}>{subtitle}</div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 'none' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, width: 248, height: 40, padding: '0 13px', borderRadius: 11, background: 'var(--surface-2)', border: '1px solid var(--line)' }}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--ink-3)" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
          <input type="text" placeholder="検索（科目・お知らせ）" aria-label="検索" style={{ border: 'none', outline: 'none', background: 'transparent', fontFamily: 'inherit', fontSize: 13, color: 'var(--ink)', width: '100%' }} />
        </div>

        <Link href="/notifications" aria-label="お知らせ" style={iconBtn}>
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d="M6 9a6 6 0 1 1 12 0c0 4 1.5 5.5 2 6H4c.5-.5 2-2 2-6z" /><path d="M10 20a2 2 0 0 0 4 0" /></svg>
          <span style={{ position: 'absolute', top: 9, right: 10, width: 7, height: 7, borderRadius: 999, background: 'var(--ink)', border: '2px solid var(--surface)' }} />
        </Link>

        <button type="button" onClick={toggleTheme} aria-label={dark ? 'ライトモードに切り替え' : 'ダークモードに切り替え'} style={iconBtn}>
          {dark ? (
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4" /><path d="M12 3v2M12 19v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M3 12h2M19 12h2M4.6 19.4l1.4-1.4M18 6l1.4-1.4" /></svg>
          ) : (
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round"><path d="M20.5 14A8.2 8.2 0 1 1 10 3.5 6.4 6.4 0 0 0 20.5 14Z" /></svg>
          )}
        </button>
      </div>
    </header>
  );
}
