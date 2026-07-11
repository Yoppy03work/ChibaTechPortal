/**
 * メニュー — 設計 isMenu 画面（全機能への入口）。
 *
 * WHY: 5タブに載らない機能はここに集約。段階実装のため、未実装の項目は遷移させず
 * 「準備中」と明示する（誤って 404 に飛ばさない）。実装済みは Link で遷移。
 */
import Link from 'next/link';

type Row = {
  label: string;
  sub: string;
  href?: string;
  badge?: boolean; // お知らせの未読ドット
  icon: React.ReactNode;
};

const ic = {
  width: 18,
  height: 18,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

const ROWS: Row[] = [
  { label: 'お知らせ', sub: '重要・学務・授業・就職', href: '/notifications', badge: true, icon: (<svg {...ic}><path d="M6 9a6 6 0 1 1 12 0c0 4 1.5 5.5 2 6H4c.5-.5 2-2 2-6z" /><path d="M10 20a2 2 0 0 0 4 0" /></svg>) },
  { label: '出席状況', sub: '出席率と欠席数', href: '/status', icon: (<svg {...ic}><circle cx="12" cy="12" r="9" /><path d="M8.4 12.4l2.4 2.4 4.8-5" /></svg>) },
  { label: '授業資料・メモ', sub: '録音・ノート・配布資料', icon: (<svg {...ic}><path d="M4 6a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" /></svg>) },
  { label: 'シラバス', sub: '履修科目と講義概要', icon: (<svg {...ic}><path d="M12 6.5C10.5 5 8 4.6 4.5 5v13c3.5-.4 6 0 7.5 1.5 1.5-1.5 4-1.9 7.5-1.5V5C16 4.6 13.5 5 12 6.5z" /><path d="M12 6.5V20" /></svg>) },
  { label: '学生資料室', sub: '過去問・申請様式・便覧', icon: (<svg {...ic}><rect x="3" y="4" width="18" height="4" rx="1" /><path d="M5 8v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8M10 12h4" /></svg>) },
  { label: 'キャンパスマップ', sub: '津田沼・新習志野・運動場', href: '/campus', icon: (<svg {...ic}><path d="M12 21s-7-5.5-7-11a7 7 0 0 1 14 0c0 5.5-7 11-7 11z" /><circle cx="12" cy="10" r="2.5" /></svg>) },
  { label: 'リンク集', sub: 'CITポータル・manaba ほか', icon: (<svg {...ic}><path d="M9 15l6-6" /><path d="M10.5 6.5l1.7-1.7a4 4 0 0 1 5.7 5.7l-1.7 1.7" /><path d="M13.5 17.5l-1.7 1.7a4 4 0 0 1-5.7-5.7l1.7-1.7" /></svg>) },
  { label: '設定', sub: '文字サイズ・通知・外部連携', href: '/settings', icon: (<svg {...ic}><circle cx="12" cy="12" r="3.2" /><path d="M12 3v2.4M12 18.6V21M21 12h-2.4M5.4 12H3M18.4 5.6l-1.7 1.7M7.3 16.7l-1.7 1.7M18.4 18.4l-1.7-1.7M7.3 7.3L5.6 5.6" /></svg>) },
];

const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  width: '100%',
  textAlign: 'left',
  background: 'var(--surface)',
  border: '1px solid var(--line)',
  borderRadius: 14,
  padding: '13px 14px',
  color: 'var(--ink)',
  boxShadow: 'var(--shadow-sm)',
  marginBottom: 10,
  textDecoration: 'none',
};

function RowInner({ row }: { row: Row }) {
  const disabled = !row.href;
  return (
    <>
      <span style={{ position: 'relative', width: 38, height: 38, borderRadius: 11, background: 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink)', flex: 'none' }}>
        {row.icon}
        {row.badge && <span style={{ position: 'absolute', top: 7, right: 8, width: 7, height: 7, borderRadius: 999, background: 'var(--ink)', border: '2px solid var(--surface-2)' }} />}
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 14, fontWeight: 600 }}>{row.label}</span>
        <span style={{ display: 'block', fontSize: 11.5, color: 'var(--ink-3)', marginTop: 2 }}>{row.sub}</span>
      </span>
      {disabled ? (
        <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--ink-3)', border: '1px solid var(--line-2)', borderRadius: 999, padding: '3px 9px', flex: 'none' }}>準備中</span>
      ) : (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--ink-3)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>
      )}
    </>
  );
}

export default function MenuPage() {
  return (
    <div className="ctp-screen">
      {ROWS.map((row) =>
        row.href ? (
          <Link key={row.label} href={row.href} style={rowStyle}>
            <RowInner row={row} />
          </Link>
        ) : (
          <div key={row.label} style={{ ...rowStyle, opacity: 0.6, cursor: 'default' }}>
            <RowInner row={row} />
          </div>
        ),
      )}
    </div>
  );
}
