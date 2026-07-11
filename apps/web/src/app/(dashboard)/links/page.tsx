/**
 * リンク集 — 設計 isLinks 画面。
 *
 * WHY: 学内の各種システムへの入口を1画面に集約。URL が確定しているもののみ
 * 実リンク（新規タブ）にし、それ以外は未設定として非活性表示する。
 */

type LinkItem = { label: string; url?: string };
type Group = { title: string; items: LinkItem[] };

const GROUPS: Group[] = [
  {
    title: '学習・授業',
    items: [
      { label: 'CIT Portal', url: 'https://portal.chibatech.ac.jp/' },
      { label: 'manaba', url: 'https://cit.manaba.jp/' },
      { label: '出席システム', url: 'https://attendance.is.it-chiba.ac.jp/attendance/' },
      { label: '履修登録・成績照会' },
      { label: 'オンライン授業 (Teams)' },
    ],
  },
  {
    title: '図書・研究',
    items: [
      { label: '図書館', url: 'https://www.lib.it-chiba.ac.jp/' },
      { label: '研究者情報', url: 'https://www.lib.it-chiba.ac.jp/cithp/KgApp' },
      { label: '電子ジャーナル' },
      { label: '学術リポジトリ' },
    ],
  },
  {
    title: '事務・手続き',
    items: [
      { label: '証明書発行（コンビニ交付）' },
      { label: '学籍・住所変更' },
      { label: '奨学金情報' },
      { label: '学費納入' },
    ],
  },
  {
    title: '公式・外部',
    items: [
      { label: '大学公式サイト', url: 'https://www.it-chiba.ac.jp/' },
      { label: '就職・キャリア' },
      { label: '大学生協' },
      { label: 'アクセス・交通' },
    ],
  },
];

export default function LinksPage() {
  return (
    <div className="ctp-screen ctp-cards" style={{ alignItems: 'start' }}>
      {GROUPS.map((g) => (
        <div key={g.title} style={{ overflow: 'hidden', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 16, padding: '16px 18px', boxShadow: 'var(--shadow-sm)' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink-3)', letterSpacing: '.04em', marginBottom: 4 }}>{g.title}</div>
          {g.items.map((item) =>
            item.url ? (
              <a key={item.label} href={item.url} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 2px', textDecoration: 'none', color: 'var(--ink)', borderTop: '1px solid var(--line)' }}>
                <span style={{ width: 6, height: 6, borderRadius: 2, background: 'var(--ink)', flex: 'none' }} />
                <span style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>{item.label}</span>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--ink-3)" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round"><path d="M7 17L17 7M9 7h8v8" /></svg>
              </a>
            ) : (
              <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 2px', color: 'var(--ink-3)', borderTop: '1px solid var(--line)', opacity: 0.75 }}>
                <span style={{ width: 6, height: 6, borderRadius: 2, background: 'var(--line-2)', flex: 'none' }} />
                <span style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>{item.label}</span>
                <span style={{ fontSize: 10, fontWeight: 700, border: '1px solid var(--line-2)', borderRadius: 999, padding: '2px 8px' }}>URL未設定</span>
              </div>
            ),
          )}
        </div>
      ))}
    </div>
  );
}
