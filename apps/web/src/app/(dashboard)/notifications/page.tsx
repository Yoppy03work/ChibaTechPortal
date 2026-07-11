'use client';

/**
 * お知らせ — 設計 isNews 画面（複数ソース集約）。
 *
 * WHY: CIT Portal / manaba / メール などを1画面に集約し、ソース別にフィルタできる。
 * フェーズ1はモック（portal-mock）。カード一覧は .ctp-cards で表示幅に応じ 1/2/3 列。
 * 実際の収集（メールの取り込み等）は worker 側の連携が必要（別タスク）。
 */
import { useState } from 'react';
import { newsItems, channelCounts, type Channel } from '@/lib/portal-mock';

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

export default function NotificationsPage() {
  const [filter, setFilter] = useState<FilterKey>('all');
  const list = filter === 'all' ? newsItems : newsItems.filter((n) => n.channel === filter);

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
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, opacity: 0.7 }}>{channelCounts[ch.key]}</span>
            </button>
          );
        })}
      </div>

      {/* 一覧（表示幅で 1/2/3 列） */}
      <div className="ctp-cards">
        {list.map((n, i) => (
          <div key={i} style={{ background: 'var(--surface)', border: `1px solid ${n.cardBorder}`, borderRadius: 15, padding: '16px 18px', boxShadow: 'var(--shadow-sm)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 10.5, fontWeight: 700, padding: '3px 9px', borderRadius: 7, background: n.tagBg, color: n.tagFg, border: `1px solid ${n.tagBorder}` }}>{n.tag}</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10.5, fontWeight: 600, padding: '3px 9px', borderRadius: 999, color: 'var(--ink-2)', border: '1px solid var(--line-2)' }}>
                <ChannelIcon channel={n.channel} />{n.channelLabel}
              </span>
              <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--ink-3)', fontFamily: 'var(--font-mono)' }}>{n.time}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 9, marginTop: 11 }}>
              {n.unread && <span style={{ width: 7, height: 7, borderRadius: 999, background: 'var(--ink)', marginTop: 6, flex: 'none' }} />}
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14.5, fontWeight: 600, lineHeight: 1.45 }}>{n.title}</div>
                <div style={{ fontSize: 12.5, color: 'var(--ink-3)', marginTop: 5, lineHeight: 1.55 }}>{n.snippet}</div>
                <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 9 }}>{n.channelLabel} · {n.source}</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
