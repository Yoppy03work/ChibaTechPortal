'use client';

/**
 * お知らせ一覧（クライアント）— ソース別フィルタ + カード。
 * WHY: フィルタ状態のみクライアントで持ち、データはサーバー(page.tsx)から props で受け取る。
 * カードは詳細ページ（/notifications/[id]）へ遷移し、そこで既読化される。
 */
import { useState } from 'react';
import Link from 'next/link';
import type { NewsRow } from '@/lib/portal-data';
import type { Channel } from '@/lib/portal-view';

type FilterKey = Channel | 'all';

const CHIPS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'すべて' },
  { key: 'cit', label: 'CIT Portal' },
  { key: 'manaba', label: 'manaba' },
  { key: 'mail', label: 'メール' },
];

const chIcon = { width: 12, height: 12, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.9, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

function ChannelIcon({ channel }: { channel: Channel }) {
  if (channel === 'mail') return (<svg {...chIcon}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 7l9 6 9-6" /></svg>);
  if (channel === 'manaba') return (<svg {...chIcon}><path d="M12 6.5C10.5 5 8 4.6 4.5 5v13c3.5-.4 6 0 7.5 1.5 1.5-1.5 4-1.9 7.5-1.5V5C16 4.6 13.5 5 12 6.5z" /><path d="M12 6.5V20" /></svg>);
  return (<svg {...chIcon}><rect x="4" y="4" width="7" height="7" rx="1.6" /><rect x="13" y="4" width="7" height="7" rx="1.6" /><rect x="4" y="13" width="7" height="7" rx="1.6" /><rect x="13" y="13" width="7" height="7" rx="1.6" /></svg>);
}

export function NotificationsList({ rows }: { rows: NewsRow[] }) {
  const [filter, setFilter] = useState<FilterKey>('all');
  const list = filter === 'all' ? rows : rows.filter((n) => n.channel === filter);
  const countOf = (k: FilterKey) => (k === 'all' ? rows.length : rows.filter((n) => n.channel === k).length);

  return (
    <div className="ctp-screen" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* ソース別フィルタ */}
      <div className="ctp-chips" style={{ display: 'flex', gap: 9, overflowX: 'auto' }}>
        {CHIPS.map((ch) => {
          const active = filter === ch.key;
          return (
            <button
              key={ch.key}
              type="button"
              onClick={() => setFilter(ch.key)}
              style={{ flex: 'none', display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 13, fontWeight: 600, padding: '8px 15px', borderRadius: 999, background: active ? 'var(--ink)' : 'var(--surface)', color: active ? 'var(--surface)' : 'var(--ink-2)', border: `1px solid ${active ? 'var(--ink)' : 'var(--line)'}` }}
            >
              {ch.key !== 'all' && <ChannelIcon channel={ch.key} />}
              {ch.label}
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, opacity: 0.7 }}>{countOf(ch.key)}</span>
            </button>
          );
        })}
      </div>

      {/* 一覧（表示幅で 1/2/3 列） */}
      {list.length === 0 ? (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 15, padding: '22px 18px', boxShadow: 'var(--shadow-sm)', fontSize: 13, color: 'var(--ink-3)', lineHeight: 1.7 }}>
          {rows.length === 0
            ? 'お知らせはまだありません。設定から CIT Portal / manaba を連携すると自動取得されます。'
            : 'このソースのお知らせはありません。'}
        </div>
      ) : (
        <div className="ctp-cards">
          {list.map((n) => (
            <Link key={n.id} href={`/notifications/${n.id}`} style={{ display: 'block', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 15, padding: '16px 18px', boxShadow: 'var(--shadow-sm)', textDecoration: 'none', color: 'var(--ink)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10.5, fontWeight: 600, padding: '3px 9px', borderRadius: 999, color: 'var(--ink-2)', border: '1px solid var(--line-2)' }}>
                  <ChannelIcon channel={n.channel} />{n.channelLabel}
                </span>
                <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--ink-3)', fontFamily: 'var(--font-mono)' }}>{n.time}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 9, marginTop: 11 }}>
                {n.unread && <span style={{ width: 7, height: 7, borderRadius: 999, background: 'var(--ink)', marginTop: 6, flex: 'none' }} />}
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 14.5, fontWeight: n.unread ? 700 : 600, lineHeight: 1.45 }}>{n.title}</div>
                  {n.snippet && <div style={{ fontSize: 12.5, color: 'var(--ink-3)', marginTop: 5, lineHeight: 1.55 }}>{n.snippet}</div>}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
