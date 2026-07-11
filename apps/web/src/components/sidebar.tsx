'use client';

/**
 * デスクトップ用サイドバー（設計 Web 版の aside）。
 *
 * WHY: PC 幅ではボトムナビの代わりに左サイドバーで全機能へ。未実装の項目は遷移させず
 * 「準備中」として淡色表示。アクティブ判定は現在パス。CSS で PC 幅のみ表示される。
 */
import Link from 'next/link';
import { usePathname } from 'next/navigation';

type Item = { label: string; href?: string; icon: React.ReactNode };

const ic = {
  width: 20,
  height: 20,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

const TOP: Item[] = [
  { label: 'ホーム', href: '/', icon: (<svg {...ic}><path d="M4 11.4 12 4l8 7.4" /><path d="M6 10.2V20h12v-9.8" /></svg>) },
  { label: '時間割', href: '/timetable', icon: (<svg {...ic}><rect x="4" y="5" width="16" height="16" rx="2.4" /><path d="M4 9.5h16M9 3v3M15 3v3" /><path d="M8.5 13h.01M12 13h.01M15.5 13h.01M8.5 17h.01M12 17h.01" /></svg>) },
  { label: '課題', href: '/assignments', icon: (<svg {...ic}><rect x="5" y="4" width="14" height="17" rx="2.2" /><path d="M9 4.5V3.5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1" /><path d="M8.6 13.2l2.2 2.2 4.2-4.4" /></svg>) },
  { label: '資料', icon: (<svg {...ic}><path d="M4 6a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" /></svg>) },
  { label: '出席', href: '/status', icon: (<svg {...ic}><circle cx="12" cy="12" r="9" /><path d="M8.4 12.4l2.4 2.4 4.8-5" /></svg>) },
  { label: 'お知らせ', href: '/notifications', icon: (<svg {...ic}><path d="M6 9a6 6 0 1 1 12 0c0 4 1.5 5.5 2 6H4c.5-.5 2-2 2-6z" /><path d="M10 20a2 2 0 0 0 4 0" /></svg>) },
  { label: 'シラバス', icon: (<svg {...ic}><path d="M12 6.5C10.5 5 8 4.6 4.5 5v13c3.5-.4 6 0 7.5 1.5 1.5-1.5 4-1.9 7.5-1.5V5C16 4.6 13.5 5 12 6.5z" /><path d="M12 6.5V20" /></svg>) },
  { label: '学生資料室', icon: (<svg {...ic}><rect x="3" y="4" width="18" height="4" rx="1" /><path d="M5 8v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8M10 12h4" /></svg>) },
  { label: 'キャンパス', href: '/campus', icon: (<svg {...ic}><path d="M12 21s-7-5.5-7-11a7 7 0 0 1 14 0c0 5.5-7 11-7 11z" /><circle cx="12" cy="10" r="2.5" /></svg>) },
  { label: '交通ダイヤ', href: '/bus', icon: (<svg {...ic}><rect x="4" y="4" width="16" height="12" rx="2" /><path d="M4 11h16M8 16v2.4M16 16v2.4" /><circle cx="8" cy="13.4" r="0.9" fill="currentColor" stroke="none" /><circle cx="16" cy="13.4" r="0.9" fill="currentColor" stroke="none" /></svg>) },
];

const BOTTOM: Item[] = [
  { label: 'リンク集', icon: (<svg {...ic}><rect x="3" y="4" width="18" height="6" rx="1.6" /><rect x="3" y="14" width="18" height="6" rx="1.6" /></svg>) },
  { label: '設定', href: '/settings', icon: (<svg {...ic}><circle cx="12" cy="12" r="3.2" /><path d="M12 3v2.4M12 18.6V21M21 12h-2.4M5.4 12H3M18.4 5.6l-1.7 1.7M7.3 16.7l-1.7 1.7M18.4 18.4l-1.7-1.7M7.3 7.3L5.6 5.6" /></svg>) },
];

function isActive(pathname: string, href?: string): boolean {
  if (!href) return false;
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(href + '/');
}

function NavButton({ item, pathname }: { item: Item; pathname: string }) {
  const active = isActive(pathname, item.href);
  const style: React.CSSProperties = {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    width: '100%',
    textAlign: 'left',
    padding: '11px 14px',
    border: 'none',
    borderRadius: 11,
    background: active ? 'var(--surface-2)' : 'transparent',
    color: item.href ? (active ? 'var(--ink)' : 'var(--ink-2)') : 'var(--ink-3)',
    fontSize: 14,
    fontWeight: active ? 700 : 500,
    boxShadow: active ? 'inset 3px 0 0 var(--ink)' : 'inset 3px 0 0 transparent',
    textDecoration: 'none',
    opacity: item.href ? 1 : 0.55,
    cursor: item.href ? 'pointer' : 'default',
  };
  const inner = (
    <>
      {item.icon}
      <span style={{ flex: 1 }}>{item.label}</span>
      {!item.href && <span style={{ fontSize: 9.5, fontWeight: 700, color: 'var(--ink-3)', border: '1px solid var(--line-2)', borderRadius: 999, padding: '2px 7px' }}>準備中</span>}
    </>
  );
  return item.href ? (
    <Link href={item.href} style={style} aria-current={active ? 'page' : undefined}>{inner}</Link>
  ) : (
    <div style={style}>{inner}</div>
  );
}

export function Sidebar({ studentId = '' }: { studentId?: string }) {
  const pathname = usePathname();
  const avatarChar = studentId ? studentId.charAt(0).toUpperCase() : '学';
  return (
    <aside
      className="ctp-sidebar"
      style={{
        position: 'sticky',
        top: 0,
        alignSelf: 'start',
        height: '100dvh',
        flexDirection: 'column',
        borderRight: '1px solid var(--line)',
        background: 'var(--surface)',
        padding: '20px 14px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '4px 8px 18px' }}>
        <svg width="30" height="30" viewBox="0 0 32 32" fill="none" aria-hidden="true">
          <rect x="2.5" y="2.5" width="27" height="27" rx="8" fill="var(--ink)" />
          <path d="M19.64 10.94A6.6 6.6 0 1 0 19.64 21.06" fill="none" stroke="var(--surface)" strokeWidth="3.4" strokeLinecap="round" />
          <rect x="20.7" y="14.3" width="3.4" height="3.4" rx="1.1" fill="var(--surface)" />
        </svg>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: '-.01em', lineHeight: 1.15 }}>ChibaTech</div>
          <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>Student Portal</div>
        </div>
      </div>

      <nav style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {TOP.map((it) => (
          <NavButton key={it.label} item={it} pathname={pathname} />
        ))}
      </nav>

      <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {BOTTOM.map((it) => (
          <NavButton key={it.label} item={it} pathname={pathname} />
        ))}
        <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: 10, borderRadius: 13, background: 'var(--surface-2)' }}>
          <div aria-hidden="true" style={{ width: 38, height: 38, borderRadius: 999, background: 'linear-gradient(135deg,#2A2D31,#15171A)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-jp)', fontWeight: 700, fontSize: 15, flex: 'none' }}>{avatarChar}</div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontFamily: 'var(--font-mono)' }}>{studentId || '—'}</div>
            <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>Student Portal</div>
          </div>
        </div>
      </div>
    </aside>
  );
}
