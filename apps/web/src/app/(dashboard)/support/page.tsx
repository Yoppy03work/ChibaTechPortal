/**
 * サポート窓口 — 設計 isSupport 画面（静的）。
 */
import Link from 'next/link';

const FAQ: { q: string; a: string }[] = [
  { q: 'ログインできない', a: 'MARINE ID とパスワードを確認してください。5回連続で失敗するとロックされ、しばらく待つと再試行できます。' },
  { q: 'お知らせ・課題が取得されない', a: '設定 → 外部サービス認証 で CIT Portal / manaba の認証情報が登録されているか確認してください。反映には時間がかかる場合があります。' },
  { q: '出席が反映されない', a: '反映には最大15分ほどかかります。翌日になっても反映されない場合は、担当教員に申し出てください。' },
  { q: '通知が届かない', a: '設定 → 通知 でプッシュ通知がオンになっているか、端末側の通知許可もあわせて確認してください。' },
];

export default function SupportPage() {
  return (
    <div className="ctp-screen" style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 720 }}>
      <Link href="/settings" style={{ alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 600, color: 'var(--ink-2)', textDecoration: 'none' }}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M15 6l-6 6 6 6" /></svg>設定に戻る
      </Link>

      <div style={{ overflow: 'hidden', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 18, padding: '22px 24px', boxShadow: 'var(--shadow-card)' }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-.01em' }}>お問い合わせ</div>
          <div style={{ fontSize: 12.5, color: 'var(--ink-3)', marginTop: 4 }}>ログイン・表示・連携のトラブルはこちらへ</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, padding: '8px 0', borderTop: '1px solid var(--line)', marginTop: 16 }}>
          <span style={{ fontSize: 13, color: 'var(--ink-3)' }}>連絡先</span>
          <span style={{ fontSize: 13, fontWeight: 600 }}>GitHub Issues（Yoppy03work/ChibaTechPortal）</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, padding: '11px 0 0', borderTop: '1px solid var(--line)' }}>
          <span style={{ fontSize: 13, color: 'var(--ink-3)' }}>対応</span>
          <span style={{ fontSize: 13, fontWeight: 600 }}>ベストエフォート（個人開発のプロトタイプ）</span>
        </div>
      </div>

      <div style={{ overflow: 'hidden', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 18, padding: '20px 24px 8px', boxShadow: 'var(--shadow-card)' }}>
        <div style={{ fontSize: 14, fontWeight: 700, paddingBottom: 6 }}>よくある質問</div>
        {FAQ.map((f) => (
          <div key={f.q} style={{ display: 'flex', gap: 11, padding: '13px 0', borderTop: '1px solid var(--line)' }}>
            <span style={{ width: 22, height: 22, borderRadius: 7, background: 'var(--ink)', color: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, flex: 'none', marginTop: 1 }}>Q</span>
            <div>
              <div style={{ fontSize: 13.5, fontWeight: 600 }}>{f.q}</div>
              <div style={{ fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.8, marginTop: 4 }}>{f.a}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
