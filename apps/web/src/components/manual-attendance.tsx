'use client';

/**
 * 手動出席（出席タブ）— 実データ版。
 *
 * WHY: QRが使えない場面のフォールバック。今日の授業（サーバーから props）に対し
 * POST /api/attendance/manual で AttendanceLog(method='manual') を記録する。
 * 外部送信は行わない（自分の記録のみ）。既に success 記録がある授業は出席済み表示。
 */
import { useState } from 'react';
import Link from 'next/link';
import type { TodayClassRow } from '@/lib/portal-data';

export function ManualAttendance({ classes, attendedIds }: { classes: TodayClassRow[]; attendedIds: string[] }) {
  const [marked, setMarked] = useState<Set<string>>(new Set(attendedIds));
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');

  async function mark(timetableId: string) {
    setBusy(timetableId);
    setError('');
    try {
      const res = await fetch('/api/attendance/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timetableId }),
      });
      if (res.ok) {
        setMarked((m) => new Set(m).add(timetableId));
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data?.error === 'Too many requests' ? '試行が多すぎます。しばらく待ってください。' : '記録に失敗しました。もう一度お試しください。');
      }
    } catch {
      setError('記録に失敗しました。通信環境を確認してください。');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div style={{ overflow: 'hidden', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 18, padding: '6px 20px 12px', boxShadow: 'var(--shadow-card)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '15px 0 6px' }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700 }}>今日の出席（手動）</div>
          <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 1 }}>QRが使えないときに手動で記録（アプリ内の記録のみ）</div>
        </div>
        <Link href="/attendance" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 700, padding: '8px 13px', borderRadius: 10, background: 'var(--ink)', color: 'var(--surface)', textDecoration: 'none', flex: 'none' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><path d="M14 14h3v3M20 14v.01M14 20v.01M17 20h.01M20 17v3" /></svg>
          QRで出席
        </Link>
      </div>

      {error && <div style={{ padding: '8px 0', fontSize: 12, color: 'var(--ink)' }}>{error}</div>}

      {classes.length === 0 && (
        <div style={{ padding: '14px 0', borderTop: '1px solid var(--line)', fontSize: 13, color: 'var(--ink-3)' }}>今日の授業はありません</div>
      )}

      {classes.map((c) => {
        const done = marked.has(c.timetableId);
        return (
          <div key={c.timetableId} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '11px 0', borderTop: '1px solid var(--line)' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5, color: 'var(--ink-2)', width: 92, flex: 'none' }}>{c.start} – {c.end}</div>
            <div style={{ width: 3, height: 32, borderRadius: 2, background: c.status === 'live' ? 'var(--ink)' : 'var(--ink-3)', flex: 'none' }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</div>
              <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.room || `${c.period}限`}</div>
            </div>
            {done ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 700, padding: '7px 12px', borderRadius: 999, background: 'var(--surface-2)', color: 'var(--ink)', border: '1px solid var(--line-2)', flex: 'none' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
                出席済み
              </span>
            ) : (
              <button
                type="button"
                onClick={() => mark(c.timetableId)}
                disabled={busy === c.timetableId}
                style={{ fontSize: 12.5, fontWeight: 700, padding: '8px 16px', borderRadius: 10, border: c.status === 'live' ? 'none' : '1px solid var(--line-2)', background: c.status === 'live' ? 'var(--ink)' : 'transparent', color: c.status === 'live' ? 'var(--surface)' : 'var(--ink)', flex: 'none', whiteSpace: 'nowrap', opacity: busy === c.timetableId ? 0.6 : 1 }}
              >
                {busy === c.timetableId ? '記録中…' : '出席する'}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
