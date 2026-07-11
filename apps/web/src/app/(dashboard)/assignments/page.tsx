'use client';

/**
 * 課題・提出物 — 設計 isAssign 画面。
 *
 * WHY: フィルタチップ（すべて/未提出/提出済）で状態を持つためクライアント。
 * データはモック（portal-mock）。カードの色/バッジは状態別スタイルを移植済み。
 */
import { useState } from 'react';
import { assignments, openCount, overdueCount } from '@/lib/portal-mock';

type Filter = 'all' | 'open' | 'done';

const CHIPS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'すべて' },
  { key: 'open', label: '未提出' },
  { key: 'done', label: '提出済' },
];

export default function AssignmentsPage() {
  const [filter, setFilter] = useState<Filter>('all');

  const filtered =
    filter === 'open'
      ? assignments.filter((a) => a.isOpen)
      : filter === 'done'
        ? assignments.filter((a) => a.isDone)
        : assignments;

  return (
    <div className="ctp-screen" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* フィルタ + 件数 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
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
      <div className="ctp-cards">
        {filtered.map((a, i) => (
          <div key={i} style={{ background: a.cardBg, border: `1px solid ${a.cardBorder}`, borderRadius: 15, padding: '16px 18px', boxShadow: 'var(--shadow-sm)', display: 'flex', flexDirection: 'column', gap: 11 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 11.5, color: a.subColor, fontWeight: 600 }}>{a.course}</div>
                <div style={{ fontSize: 14.5, fontWeight: 600, color: a.titleColor, marginTop: 3, lineHeight: 1.4 }}>{a.title}</div>
              </div>
              <span style={{ fontSize: 10.5, fontWeight: 700, padding: '3px 9px', borderRadius: 999, background: a.badgeBg, color: a.badgeFg, border: `1px solid ${a.badgeBorder}`, flex: 'none', whiteSpace: 'nowrap' }}>{a.badgeLabel}</span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, color: a.metaColor }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7.5V12l3 2" /></svg>
                {a.due}
              </span>
              {a.hasLeft && <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>· {a.left}</span>}
            </div>

            {a.isOpen && (
              <div style={{ display: 'flex', gap: 9, paddingTop: 3 }}>
                <button type="button" style={{ fontSize: 12.5, fontWeight: 700, padding: '8px 16px', borderRadius: 10, border: 'none', background: a.actBg, color: a.actFg }}>提出する</button>
                <button type="button" style={{ fontSize: 12.5, fontWeight: 600, padding: '8px 14px', borderRadius: 10, border: `1px solid ${a.badgeBorder}`, background: 'transparent', color: a.titleColor }}>詳細</button>
              </div>
            )}

            {a.isDone && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingTop: 10, borderTop: '1px solid var(--line)' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12, color: 'var(--ink-2)', minWidth: 0, flex: 1 }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--ink-3)" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /></svg>
                  <span style={{ fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0, maxWidth: 170 }}>{a.fileText}</span>
                </span>
                {a.isGraded && (
                  <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--ink-3)', flex: 'none' }}>
                    評価 <b style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink)', fontSize: 13 }}>{a.scoreText}</b>
                  </span>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
