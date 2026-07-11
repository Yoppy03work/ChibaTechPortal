'use client';

/**
 * 手動出席（出席タブ）。
 *
 * WHY: QRが使えない場面のフォールバックとして、今日の授業を手動で「出席」記録できる。
 * フェーズ1はモック（ローカル状態で出席済みにする）。将来は /api/attendance/submit 等の
 * 実登録に接続する（3モードのうち manual に相当）。QR出席は /attendance の実フローへ誘導。
 */
import { useState } from 'react';
import Link from 'next/link';
import { todayClasses } from '@/lib/portal-mock';

export function ManualAttendance() {
  const [marked, setMarked] = useState<Record<number, boolean>>({});

  return (
    <div style={{ overflow: 'hidden', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 18, padding: '6px 20px 12px', boxShadow: 'var(--shadow-card)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '15px 0 6px' }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700 }}>今日の出席（手動）</div>
          <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 1 }}>QRが使えないときに手動で記録</div>
        </div>
        <Link href="/attendance" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 700, padding: '8px 13px', borderRadius: 10, background: 'var(--ink)', color: 'var(--surface)', textDecoration: 'none', flex: 'none' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><path d="M14 14h3v3M20 14v.01M14 20v.01M17 20h.01M20 17v3" /></svg>
          QRで出席
        </Link>
      </div>

      {todayClasses.map((c, i) => {
        const done = marked[i];
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '11px 0', borderTop: '1px solid var(--line)' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5, color: 'var(--ink-2)', width: 92, flex: 'none' }}>{c.start} – {c.end}</div>
            <div style={{ width: 3, height: 32, borderRadius: 2, background: c.dot, flex: 'none' }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</div>
              <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.meta}</div>
            </div>
            {done ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 700, padding: '7px 12px', borderRadius: 999, background: 'var(--surface-2)', color: 'var(--ink)', border: '1px solid var(--line-2)', flex: 'none' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
                出席済み
              </span>
            ) : (
              <button type="button" onClick={() => setMarked((m) => ({ ...m, [i]: true }))} style={{ fontSize: 12.5, fontWeight: 700, padding: '8px 16px', borderRadius: 10, border: c.live ? 'none' : '1px solid var(--line-2)', background: c.live ? 'var(--ink)' : 'transparent', color: c.live ? 'var(--surface)' : 'var(--ink)', flex: 'none', whiteSpace: 'nowrap' }}>
                出席する
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
