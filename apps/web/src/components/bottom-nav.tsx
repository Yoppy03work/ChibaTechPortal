'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV_ITEMS = [
  { label: 'ホーム', href: '/' },
  { label: '時間割', href: '/timetable' },
  { label: 'お知らせ', href: '/notifications' },
  { label: '出席', href: '/attendance' },
  { label: '設定', href: '/settings' },
] as const;

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 flex justify-around border-t border-gray-200 bg-white py-3">
      {NAV_ITEMS.map((item) => {
        const active = item.href === '/'
          ? pathname === '/'
          : pathname.startsWith(item.href);

        return (
          <Link
            key={item.href}
            href={item.href}
            className={`text-xs ${active ? 'font-bold text-[#2563EB]' : 'text-gray-400'}`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
