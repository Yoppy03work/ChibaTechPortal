/**
 * プライバシーポリシー — 設計 isPrivacy 画面（静的）。
 */
import Link from 'next/link';

const SECTIONS: { title: string; body: string }[] = [
  { title: '1. 収集する情報', body: '学籍番号・大学メールアドレスなどの基本情報、履修・出席・課題の提出状況、および本サービスの利用記録（アクセスログ）を収集します。' },
  { title: '2. 利用目的', body: '時間割・出席・課題などの情報表示、重要なお知らせの配信、ならびにサービスの改善・障害対応のための分析に利用します。' },
  { title: '3. 第三者への提供', body: '法令に基づく場合を除き、本人の同意なく個人情報を第三者に提供することはありません。' },
  { title: '4. 外部サービスとの連携', body: 'CIT Portal・manaba との連携は本人の操作によってのみ開始され、設定画面からいつでも解除できます。認証情報は AES-256-GCM で暗号化して保存され、情報取得の目的にのみ使用します。' },
  { title: '5. 保管と安全管理', body: '収集した情報は情報セキュリティ基準に従って安全に保管し、利用目的の達成に必要な期間を超えて保持しません。' },
  { title: '6. お問い合わせ', body: '本ポリシーに関するご質問は、サポート窓口までお寄せください。' },
];

export default function PrivacyPage() {
  return (
    <div className="ctp-screen" style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 720 }}>
      <Link href="/settings" style={{ alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 600, color: 'var(--ink-2)', textDecoration: 'none' }}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M15 6l-6 6 6 6" /></svg>設定に戻る
      </Link>
      <div style={{ overflow: 'hidden', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 18, padding: 18, boxShadow: 'var(--shadow-card)' }}>
        <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-.01em' }}>プライバシーポリシー</div>
        <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 5, fontFamily: 'var(--font-mono)' }}>最終更新 2026-04-01 · v1.0.0</div>
        {SECTIONS.map((s) => (
          <div key={s.title} style={{ padding: '14px 0 2px', borderTop: '1px solid var(--line)', marginTop: 14 }}>
            <div style={{ fontSize: 13.5, fontWeight: 700 }}>{s.title}</div>
            <div style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.9, marginTop: 6 }}>{s.body}</div>
          </div>
        ))}
        <Link href="/support" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 16, fontSize: 12.5, fontWeight: 700, padding: '9px 16px', borderRadius: 10, background: 'var(--ink)', color: 'var(--surface)', textDecoration: 'none' }}>
          サポート窓口へ
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>
        </Link>
      </div>
    </div>
  );
}
