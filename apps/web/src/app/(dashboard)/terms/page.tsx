/**
 * 利用規約 — 設計 isTerms 画面（静的）。
 */
import Link from 'next/link';

const SECTIONS: { title: string; body: string }[] = [
  { title: '第1条（適用）', body: '本規約は、ChibaTech Portal（以下「本サービス」）の利用条件を定めるものです。利用者は本規約に同意のうえ本サービスを利用するものとします。' },
  { title: '第2条（アカウント）', body: '本サービスの利用には大学が発行する MARINE アカウントが必要です。アカウントの管理責任は利用者本人が負い、第三者への貸与・譲渡はできません。' },
  { title: '第3条（禁止事項）', body: '不正アクセス、他者へのなりすまし、本サービスの運営を妨げる行為、その他法令または学則に違反する行為を禁止します。' },
  { title: '第4条（サービスの変更・停止）', body: '保守点検・障害発生・その他やむを得ない事由により、予告なく本サービスの全部または一部を変更・停止することがあります。' },
  { title: '第5条（免責）', body: '本サービスに表示される時間割・出席・交通ダイヤ等の情報は変更される場合があります。重要な手続きの際は、各掲示および公式の案内をあわせて確認してください。' },
  { title: '第6条（規約の変更）', body: '本規約は必要に応じて改定されることがあります。改定後の規約は、本サービス上に掲示した時点から効力を生じます。' },
];

export default function TermsPage() {
  return (
    <div className="ctp-screen" style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 720 }}>
      <Link href="/settings" style={{ alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 600, color: 'var(--ink-2)', textDecoration: 'none' }}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M15 6l-6 6 6 6" /></svg>設定に戻る
      </Link>
      <div style={{ overflow: 'hidden', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 18, padding: 18, boxShadow: 'var(--shadow-card)' }}>
        <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-.01em' }}>ChibaTech Portal 利用規約</div>
        <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 5, fontFamily: 'var(--font-mono)' }}>最終更新 2026-04-01 · v1.0.0</div>
        {SECTIONS.map((s) => (
          <div key={s.title} style={{ padding: '14px 0 2px', borderTop: '1px solid var(--line)', marginTop: 14 }}>
            <div style={{ fontSize: 13.5, fontWeight: 700 }}>{s.title}</div>
            <div style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.9, marginTop: 6 }}>{s.body}</div>
          </div>
        ))}
        <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--line)' }}>附則 — 本規約は 2026年4月1日 から施行します。</div>
      </div>
    </div>
  );
}
