/**
 * 学生資料室 — 設計 isShiryo 画面。
 *
 * WHY: 3号館1Fの学生資料室に置かれた各種資料へのインデックス。アーカイブの
 * デジタル化は未対応のため、カテゴリと件数の案内（静的）を表示する。
 */

const ic = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'var(--ink)', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

const ROWS = [
  { name: '過去問アーカイブ', count: '1,240 件', icon: (<svg {...ic}><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5M9 14l2 2 4-4" /></svg>) },
  { name: '講義資料・レジュメ', count: '860 件', icon: (<svg {...ic}><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M4 16V6a2 2 0 0 1 2-2h10" /></svg>) },
  { name: '各種申請様式', count: '38 種', icon: (<svg {...ic}><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M9 8h6M9 12h6M9 16h3" /></svg>) },
  { name: '学生便覧・履修要項', count: '12 冊', icon: (<svg {...ic}><path d="M5 5a2 2 0 0 1 2-2h11v18H7a2 2 0 0 0-2 2z" /><path d="M18 17H7" /></svg>) },
  { name: '研究室・ゼミ資料', count: '320 件', icon: (<svg {...ic}><path d="M4 7a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" /></svg>) },
  { name: '就職・進路データ', count: '154 件', icon: (<svg {...ic}><path d="M5 19V5M10 19v-7M15 19V9M20 19v-4" /></svg>) },
];

export default function LibraryPage() {
  return (
    <div className="ctp-screen" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 16, padding: '14px 18px', boxShadow: 'var(--shadow-sm)', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: 11, background: 'var(--surface-2)', border: '1px solid var(--line-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none', color: 'var(--ink)' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="4" rx="1" /><path d="M5 8v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8M10 12h4" /></svg>
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700 }}>3号館 1F · 学生資料室</div>
            <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 1 }}>各種データ・資料をまとめて保管／配布しています</div>
          </div>
        </div>
        <span style={{ fontSize: 11.5, color: 'var(--ink-3)', fontFamily: 'var(--font-mono)', flex: 'none' }}>開館 8:30–20:00</span>
      </div>

      <div className="ctp-cards">
        {ROWS.map((r) => (
          <div key={r.name} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '14px 15px', borderRadius: 13, border: '1px solid var(--line)', background: 'var(--surface)', color: 'var(--ink)', boxShadow: 'var(--shadow-sm)' }}>
            <span style={{ width: 38, height: 38, borderRadius: 10, background: 'var(--surface-2)', border: '1px solid var(--line-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>{r.icon}</span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: 13.5, fontWeight: 600 }}>{r.name}</span>
              <span style={{ display: 'block', fontSize: 11, color: 'var(--ink-3)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>{r.count}</span>
            </span>
            <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--ink-3)', border: '1px solid var(--line-2)', borderRadius: 999, padding: '3px 9px', flex: 'none' }}>窓口配布</span>
          </div>
        ))}
      </div>

      <div style={{ fontSize: 12, color: 'var(--ink-3)', padding: '0 4px', lineHeight: 1.7 }}>
        資料の閲覧・受け取りは学生資料室の窓口で。デジタルアーカイブへの接続は準備中です。
      </div>
    </div>
  );
}
