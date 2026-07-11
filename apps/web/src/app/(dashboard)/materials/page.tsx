'use client';

/**
 * 授業資料・メモ — 設計 isMat 画面。
 *
 * WHY: 録音・ノート・配布資料をまとめる画面。ストレージ連携（アップロード/録音）は
 * 未実装のためサンプル表示＋ボタンは準備中。フィルタチップのみ動作する。
 */
import { useState } from 'react';

type MatType = 'audio' | 'scan' | 'pdf' | 'slide' | 'note' | 'link';

type MatItem = {
  type: MatType;
  title: string;
  course: string;
  meta: string;
  date: string;
  tag?: string;
};

const TYPE_NAME: Record<MatType, string> = { audio: '音声', scan: 'スキャン', pdf: 'PDF', slide: 'スライド', note: 'メモ', link: 'リンク' };

const ITEMS: MatItem[] = [
  { type: 'audio', title: '講義録音 第8回「通信路符号化」', course: '情報理論', meta: '47:12', date: '2日前', tag: '文字起こし済' },
  { type: 'note', title: '試験範囲まとめ', course: '確率統計', meta: 'テキストメモ', date: '今日' },
  { type: 'scan', title: '手書きノート（スキャン）', course: '線形代数学Ⅱ', meta: '画像 6ページ', date: '3日前' },
  { type: 'pdf', title: 'レジュメ 第8回', course: '情報理論', meta: 'PDF · 2.4MB', date: '2日前' },
  { type: 'audio', title: '音声メモ「実験の手順」', course: '電気回路実験', meta: '03:48', date: '昨日' },
  { type: 'slide', title: '演習スライド #5', course: 'プログラミング演習Ⅱ', meta: 'スライド 32枚', date: '5日前' },
  { type: 'scan', title: '板書写真', course: '確率統計', meta: '画像 3枚', date: '1週間前' },
  { type: 'link', title: '参考：Shannon 1948 (PDF)', course: '情報理論', meta: '外部リンク', date: '1週間前' },
];

const ic = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

function TypeIcon({ type }: { type: MatType }) {
  switch (type) {
    case 'audio': return (<svg {...ic}><path d="M12 4v16" /><path d="M8 8v8" /><path d="M4 11v2" /><path d="M16 7v10" /><path d="M20 10v4" /></svg>);
    case 'scan': return (<svg {...ic}><rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="8.5" cy="11" r="1.6" /><path d="M21 17l-5-5-8 8" /></svg>);
    case 'pdf': return (<svg {...ic}><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /></svg>);
    case 'slide': return (<svg {...ic}><rect x="3" y="4" width="18" height="13" rx="2" /><path d="M12 17v4M9 21h6" /></svg>);
    case 'link': return (<svg {...ic}><path d="M9 15l6-6" /><path d="M10.5 6.5l1.7-1.7a4 4 0 0 1 5.7 5.7l-1.7 1.7" /><path d="M13.5 17.5l-1.7 1.7a4 4 0 0 1-5.7-5.7l1.7-1.7" /></svg>);
    default: return (<svg {...ic}><path d="M6 3h9l4 4v14H6z" /><path d="M9 9h6M9 13h6M9 17h4" /></svg>);
  }
}

const COURSES = ['all', ...new Set(ITEMS.map((x) => x.course))];

export default function MaterialsPage() {
  const [filter, setFilter] = useState('all');
  const list = filter === 'all' ? ITEMS : ITEMS.filter((x) => x.course === filter);

  const actionBtn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12.5, fontWeight: 700, padding: '9px 15px', borderRadius: 11, border: 'none', background: 'var(--ink)', color: 'var(--surface)', opacity: 0.45, cursor: 'default' };

  return (
    <div className="ctp-screen" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* WHY: サンプル表示（保存機能は準備中） */}
      <div style={{ fontSize: 12, color: 'var(--ink-3)', padding: '0 2px' }}>
        プレビュー版：表示はサンプルです。アップロード・録音の保存機能は準備中。
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div className="ctp-chips" style={{ display: 'flex', gap: 9, overflowX: 'auto', minWidth: 0 }}>
          {COURSES.map((c) => {
            const active = filter === c;
            return (
              <button key={c} type="button" onClick={() => setFilter(c)} style={{ flex: 'none', fontSize: 13, fontWeight: 600, padding: '8px 15px', borderRadius: 999, background: active ? 'var(--ink)' : 'var(--surface)', color: active ? 'var(--surface)' : 'var(--ink-2)', border: `1px solid ${active ? 'var(--ink)' : 'var(--line)'}` }}>
                {c === 'all' ? 'すべて' : c}
              </button>
            );
          })}
        </div>
        <div style={{ display: 'flex', gap: 9, flex: 'none' }}>
          <button type="button" aria-disabled="true" title="準備中" style={actionBtn}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5M5 12l7-7 7 7" /></svg>アップロード
          </button>
          <button type="button" aria-disabled="true" title="準備中" style={{ ...actionBtn, background: 'var(--surface)', color: 'var(--ink)', border: '1px solid var(--line-2)' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M6 11a6 6 0 0 0 12 0M12 17v3" /></svg>録音
          </button>
        </div>
      </div>

      <div className="ctp-cards">
        {list.map((x, i) => (
          <div key={i} style={{ overflow: 'hidden', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 15, padding: '15px 16px', boxShadow: 'var(--shadow-sm)', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <div style={{ width: 38, height: 38, borderRadius: 11, background: 'var(--surface-2)', color: 'var(--ink)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
                <TypeIcon type={x.type} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.4 }}>{x.title}</div>
                <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 2 }}>{x.course} · {TYPE_NAME[x.type]} · {x.date}</div>
              </div>
              {x.tag && <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 7, color: 'var(--ink-2)', border: '1px solid var(--line-2)', flex: 'none', whiteSpace: 'nowrap' }}>{x.tag}</span>}
            </div>
            {x.type === 'audio' ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                <button type="button" aria-label="再生" style={{ width: 34, height: 34, borderRadius: 999, border: 'none', background: 'var(--ink)', color: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                </button>
                <div style={{ flex: 1, height: 6, borderRadius: 999, background: 'var(--surface-2)', overflow: 'hidden' }}><div style={{ height: '100%', width: '32%', background: 'var(--ink)', borderRadius: 999 }} /></div>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--ink-2)', flex: 'none' }}>{x.meta}</span>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingTop: 11, borderTop: '1px solid var(--line)' }}>
                <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>{x.meta}</span>
                <button type="button" style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink)', background: 'none', border: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  開く<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
