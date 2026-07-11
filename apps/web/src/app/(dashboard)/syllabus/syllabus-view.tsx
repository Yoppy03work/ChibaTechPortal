'use client';

/**
 * シラバス（クライアント）— 履修中の科目リスト + 詳細パネル。
 *
 * WHY: 選択状態と検索のみクライアントで持つ。データはサーバー(page.tsx)から props。
 * 設計 isSyl のレイアウト（左=科目リスト/右=詳細）。成績評価などは実データが自由
 * テキストのため、バーではなくテキストブロックで表示する。
 */
import { useMemo, useState } from 'react';

export interface SyllabusCourse {
  key: string;
  name: string;
  code: string;
  instructor: string;
  slot: string;
  category: string | null;
  objectives: string | null;
  schedule: string | null;
  evaluation: string | null;
  textbooks: string | null;
  originalUrl: string | null;
  hasSyllabus: boolean;
}

const card: React.CSSProperties = { overflow: 'hidden', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 18, boxShadow: 'var(--shadow-card)' };

function Section({ title, text }: { title: string; text: string | null }) {
  if (!text) return null;
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-3)', letterSpacing: '.04em', marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: 13.5, lineHeight: 1.75, color: 'var(--ink-2)', whiteSpace: 'pre-wrap' }}>{text}</div>
    </div>
  );
}

export function SyllabusView({ courses }: { courses: SyllabusCourse[] }) {
  const [selected, setSelected] = useState<string | null>(courses.find((c) => c.hasSyllabus)?.key ?? courses[0]?.key ?? null);
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return courses;
    return courses.filter((c) => `${c.name} ${c.instructor} ${c.code}`.toLowerCase().includes(q));
  }, [courses, query]);

  const cur = courses.find((c) => c.key === selected) ?? null;

  return (
    <div className="ctp-screen" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* 検索 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 11, background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 13, padding: '13px 16px', boxShadow: 'var(--shadow-sm)', maxWidth: 560 }}>
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="var(--ink-3)" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
        <input type="text" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="科目名・教員・科目コードで検索" aria-label="シラバス検索" style={{ border: 'none', outline: 'none', background: 'transparent', fontFamily: 'inherit', fontSize: 14, color: 'var(--ink)', width: '100%' }} />
      </div>

      {courses.length === 0 ? (
        <div style={{ ...card, padding: '22px 20px', fontSize: 13, color: 'var(--ink-3)', lineHeight: 1.7 }}>
          履修中の科目がありません。時間割を登録（設定から CIT Portal 連携）するとここに表示されます。
        </div>
      ) : (
        <div className="ctp-home-grid" style={{ alignItems: 'start' }}>
          {/* 科目リスト */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 2px' }}>
              <span style={{ fontSize: 14, fontWeight: 700 }}>履修中の科目</span>
              <span style={{ fontSize: 12, color: 'var(--ink-3)', fontFamily: 'var(--font-mono)' }}>{courses.length}科目</span>
            </div>
            {filtered.map((c) => {
              const active = c.key === selected;
              return (
                <button key={c.key} type="button" onClick={() => setSelected(c.key)} style={{ textAlign: 'left', background: 'var(--surface)', border: `1px solid ${active ? 'var(--ink)' : 'var(--line)'}`, borderRadius: 14, padding: '12px 14px', boxShadow: 'var(--shadow-sm)', display: 'flex', alignItems: 'center', gap: 13, width: '100%' }}>
                  <div style={{ width: 44, height: 40, borderRadius: 11, background: active ? 'var(--ink)' : 'var(--surface-2)', color: active ? 'var(--surface)' : 'var(--ink-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, flex: 'none', textAlign: 'center', lineHeight: 1.15, whiteSpace: 'pre-line' }}>{c.code}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: 'var(--ink)' }}>{c.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{[c.instructor, c.slot].filter(Boolean).join(' · ')}</div>
                  </div>
                  {c.category && <span style={{ fontSize: 10.5, fontWeight: 700, padding: '3px 9px', borderRadius: 7, background: 'var(--surface-2)', color: 'var(--ink-2)', flex: 'none' }}>{c.category}</span>}
                  {!c.hasSyllabus && <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 999, color: 'var(--ink-3)', border: '1px solid var(--line-2)', flex: 'none' }}>未取得</span>}
                </button>
              );
            })}
            {filtered.length === 0 && (
              <div style={{ padding: '14px 4px', fontSize: 13, color: 'var(--ink-3)' }}>該当する科目がありません</div>
            )}
          </div>

          {/* 詳細 */}
          <div style={{ ...card, padding: 22, display: 'flex', flexDirection: 'column', gap: 16 }}>
            {cur ? (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
                  <div style={{ width: 50, height: 50, borderRadius: 13, background: 'var(--ink)', color: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, flex: 'none', textAlign: 'center', lineHeight: 1.15, whiteSpace: 'pre-line' }}>{cur.code}</div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 18, fontWeight: 700 }}>{cur.name}</div>
                    <div style={{ fontSize: 12.5, color: 'var(--ink-3)', marginTop: 2 }}>{[cur.instructor, cur.slot, cur.category].filter(Boolean).join(' · ')}</div>
                  </div>
                </div>
                {cur.hasSyllabus ? (
                  <>
                    <Section title="概要・到達目標" text={cur.objectives} />
                    <Section title="授業計画" text={cur.schedule} />
                    <Section title="成績評価" text={cur.evaluation} />
                    <Section title="教科書・参考書" text={cur.textbooks} />
                    {cur.originalUrl && (
                      <div style={{ borderTop: '1px solid var(--line)', paddingTop: 15 }}>
                        <a href={cur.originalUrl} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 700, padding: '9px 16px', borderRadius: 10, background: 'var(--ink)', color: 'var(--surface)', textDecoration: 'none' }}>
                          CIT Portal で開く
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M7 17L17 7M9 7h8v8" /></svg>
                        </a>
                      </div>
                    )}
                  </>
                ) : (
                  <div style={{ fontSize: 13, color: 'var(--ink-3)', lineHeight: 1.7 }}>
                    この科目のシラバスはまだ取得されていません。シラバス同期が有効な場合、次回の同期で取り込まれます。
                  </div>
                )}
              </>
            ) : (
              <div style={{ fontSize: 13, color: 'var(--ink-3)' }}>科目を選択してください</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
