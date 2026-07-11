'use client';

/**
 * 課題一覧（クライアント）— フィルタ + 状態別カード。
 * WHY: フィルタ状態のみクライアント。データはサーバー(page.tsx)から props。
 * 「提出する/開く」は manaba の課題URLを新規タブで開く（提出自体は manaba 上で行う）。
 */
import { useState } from 'react';
import type { AssignmentRow } from '@/lib/portal-data';
import { assignStyle } from '@/lib/portal-view';

type Filter = 'all' | 'open' | 'done';

const CHIPS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'すべて' },
  { key: 'open', label: '未提出' },
  { key: 'done', label: '提出済' },
];

export function AssignmentsList({ rows }: { rows: AssignmentRow[] }) {
  const [filter, setFilter] = useState<Filter>('all');

  const isOpen = (r: AssignmentRow) => r.status !== 'submitted';
  const filtered = filter === 'open' ? rows.filter(isOpen) : filter === 'done' ? rows.filter((r) => !isOpen(r)) : rows;
  const openCount = rows.filter(isOpen).length;
  const overdueCount = rows.filter((r) => r.status === 'overdue').length;

  return (
    <div className="ctp-screen" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* フィルタ + 件数 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div className="ctp-chips" style={{ display: 'flex', gap: 9 }}>
          {CHIPS.map((ch) => {
            const active = filter === ch.key;
            return (
              <button
                key={ch.key}
                type="button"
                onClick={() => setFilter(ch.key)}
                style={{ fontSize: 13, fontWeight: 600, padding: '8px 16px', borderRadius: 999, background: active ? 'var(--ink)' : 'var(--surface)', color: active ? 'var(--surface)' : 'var(--ink-2)', border: `1px solid ${active ? 'var(--ink)' : 'var(--line)'}` }}
              >
                {ch.label}
              </button>
            );
          })}
        </div>
        <div style={{ fontSize: 12.5, color: 'var(--ink-3)' }}>
          未提出 <b style={{ color: 'var(--ink)', fontFamily: 'var(--font-mono)' }}>{openCount}</b> 件 · 期限切れ{' '}
          <b style={{ color: 'var(--ink)', fontFamily: 'var(--font-mono)' }}>{overdueCount}</b> 件
        </div>
      </div>

      {/* カード一覧（表示幅で 1/2/3 列） */}
      {filtered.length === 0 ? (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 15, padding: '22px 18px', boxShadow: 'var(--shadow-sm)', fontSize: 13, color: 'var(--ink-3)', lineHeight: 1.7 }}>
          {rows.length === 0
            ? '課題はまだありません。設定から manaba を連携すると自動取得されます。'
            : '該当する課題はありません。'}
        </div>
      ) : (
        <div className="ctp-cards">
          {filtered.map((a) => {
            const s = assignStyle(a.status);
            const open = isOpen(a);
            return (
              <div key={a.id} style={{ background: s.cardBg, border: `1px solid ${s.cardBorder}`, borderRadius: 15, padding: '16px 18px', boxShadow: 'var(--shadow-sm)', display: 'flex', flexDirection: 'column', gap: 11 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 11.5, color: s.subColor, fontWeight: 600 }}>{a.course}</div>
                    <div style={{ fontSize: 14.5, fontWeight: 600, color: s.titleColor, marginTop: 3, lineHeight: 1.4 }}>{a.title}</div>
                  </div>
                  <span style={{ fontSize: 10.5, fontWeight: 700, padding: '3px 9px', borderRadius: 999, background: s.badgeBg, color: s.badgeFg, border: `1px solid ${s.badgeBorder}`, flex: 'none', whiteSpace: 'nowrap' }}>{s.badgeLabel}</span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, color: s.metaColor }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7.5V12l3 2" /></svg>
                    {a.due}
                  </span>
                  {a.left && <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>· {a.left}</span>}
                </div>

                <div style={{ display: 'flex', gap: 9, paddingTop: 3 }}>
                  <a href={a.url} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 700, padding: '8px 16px', borderRadius: 10, border: 'none', background: open ? s.actBg : 'transparent', color: open ? s.actFg : s.titleColor, textDecoration: 'none', ...(open ? {} : { border: `1px solid ${s.badgeBorder}` }) }}>
                    {open ? 'manabaで提出' : 'manabaで開く'}
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M7 17L17 7M9 7h8v8" /></svg>
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
