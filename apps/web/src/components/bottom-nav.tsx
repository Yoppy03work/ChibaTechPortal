'use client';

/**
 * ボトムナビゲーション（設計: ホーム / 時間割 / 課題 / バス / メニュー）。
 *
 * WHY: 設計はタブ状態の SPA だが、本アプリは Next のルーティングに載せる。
 * 5タブ + それ以外は「メニュー」配下。アクティブ判定は現在のパスで行う。
 */
import Link from 'next/link';
import { usePathname } from 'next/navigation';

type Item = { label: string; href: string; icon: React.ReactNode; small?: boolean };

const iconProps = {
  width: 23,
  height: 23,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

const NAV_ITEMS: Item[] = [
  {
    label: 'ホーム',
    href: '/',
    icon: (
      <svg {...iconProps}>
        <path d="M4 11.4 12 4l8 7.4" />
        <path d="M6 10.2V20h12v-9.8" />
      </svg>
    ),
  },
  {
    label: '時間割',
    href: '/timetable',
    icon: (
      <svg {...iconProps}>
        <rect x="4" y="5" width="16" height="16" rx="2.4" />
        <path d="M4 9.5h16M9 3v3M15 3v3" />
        <path d="M8.5 13h.01M12 13h.01M15.5 13h.01M8.5 17h.01M12 17h.01" />
      </svg>
    ),
  },
  {
    label: '課題',
    href: '/assignments',
    icon: (
      <svg {...iconProps}>
        <path d="M9 5h6v3H9z" />
        <path d="M15 5h2a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2" />
        <path d="M9 14l2 2 4-4.5" />
      </svg>
    ),
  },
  {
    label: 'バス',
    href: '/bus',
    icon: (
      <svg {...iconProps}>
        <rect x="4" y="4" width="16" height="12" rx="2" />
        <path d="M4 11h16M8 16v2.4M16 16v2.4" />
        <circle cx="8" cy="13.4" r="0.9" fill="currentColor" stroke="none" />
        <circle cx="16" cy="13.4" r="0.9" fill="currentColor" stroke="none" />
      </svg>
    ),
  },
  {
    label: 'メニュー',
    href: '/menu',
    small: true,
    icon: (
      <svg {...iconProps}>
        <rect x="4" y="4" width="7" height="7" rx="1.8" />
        <rect x="13" y="4" width="7" height="7" rx="1.8" />
        <rect x="4" y="13" width="7" height="7" rx="1.8" />
        <rect x="13" y="13" width="7" height="7" rx="1.8" />
      </svg>
    ),
  },
];

function isActive(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(href + '/');
}

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="ctp-mobile-only"
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 30,
        display: 'grid',
        gridTemplateColumns: 'repeat(5, 1fr)',
        background: 'var(--surface)',
        borderTop: '1px solid var(--line)',
        padding: '7px 6px calc(10px + env(safe-area-inset-bottom))',
        boxShadow: 'var(--shadow-nav)',
      }}
    >
      {NAV_ITEMS.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-label={item.label}
            aria-current={active ? 'page' : undefined}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 5,
              padding: '4px 0',
              textDecoration: 'none',
              color: active ? 'var(--ink)' : 'var(--ink-2)',
            }}
          >
            <span
              style={{
                height: 3,
                width: 18,
                borderRadius: 999,
                background: active ? 'var(--ink)' : 'transparent',
              }}
            />
            {item.icon}
            <span
              style={{
                fontSize: item.small ? 9 : 10,
                fontWeight: active ? 700 : 500,
                whiteSpace: 'nowrap',
              }}
            >
              {item.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
