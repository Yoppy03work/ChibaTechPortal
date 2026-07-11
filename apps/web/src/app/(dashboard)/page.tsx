/**
 * ホーム（ダッシュボード）— 設計 isHome 画面。
 *
 * WHY: フェーズ1は見た目優先・モックデータ。将来 Server Component で実データ
 * （次の授業・お知らせ・出席率）に差し替える。現状はナビゲーションのみで状態を
 * 持たないため素の Server Component（Link 遷移）で実装する。
 */
import Link from 'next/link';
import { todayClasses, newsTop, riskCourses } from '@/lib/portal-mock';

const card: React.CSSProperties = {
  overflow: 'hidden',
  background: 'var(--surface)',
  border: '1px solid var(--line)',
  borderRadius: 18,
  boxShadow: 'var(--shadow-card)',
};

const statCard: React.CSSProperties = {
  overflow: 'hidden',
  background: 'var(--surface)',
  border: '1px solid var(--line)',
  borderRadius: 14,
  padding: '10px 12px',
  boxShadow: 'var(--shadow-sm)',
};

function Stat({ label, value, unit, unitBig }: { label: string; value: string; unit: string; unitBig?: boolean }) {
  return (
    <div style={statCard}>
      <div style={{ fontSize: 10.5, color: 'var(--ink-3)', fontWeight: 600 }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: unitBig ? 2 : 4, marginTop: 4 }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 19, fontWeight: 700, letterSpacing: '-.03em' }}>{value}</span>
        <span style={{ fontSize: unitBig ? 15 : 11, color: 'var(--ink-2)', fontWeight: unitBig ? 700 : 600 }}>{unit}</span>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <div className="ctp-screen" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* 統計3枚 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
        <Stat label="今日の授業" value="4" unit="コマ" />
        <Stat label="今週の出席率" value="94" unit="%" unitBig />
        <Stat label="未読お知らせ" value="2" unit="件" />
      </div>

      <div className="ctp-home-grid">
        <div className="ctp-col">
      {/* 次の授業ヒーロー */}
      <div
        style={{
          position: 'relative',
          overflow: 'hidden',
          borderRadius: 18,
          padding: '14px 16px',
          color: '#fff',
          background: 'linear-gradient(140deg,#23262B 0%, #15171A 55%, #0E0F11 100%)',
          border: '1px solid rgba(255,255,255,.07)',
          boxShadow: '0 18px 38px -20px rgba(10,12,15,.6)',
        }}
      >
        <div aria-hidden="true" style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(255,255,255,.06) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.06) 1px,transparent 1px)', backgroundSize: '24px 24px' }} />
        <div aria-hidden="true" style={{ position: 'absolute', top: -50, right: -40, width: 200, height: 200, borderRadius: 999, background: 'radial-gradient(circle, rgba(255,255,255,.13), transparent 68%)' }} />
        <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 11, fontWeight: 600, letterSpacing: '.05em', background: 'rgba(255,255,255,.14)', padding: '5px 11px', borderRadius: 999 }}>
              <span style={{ width: 7, height: 7, borderRadius: 999, background: '#fff' }} />次の授業 · あと18分
            </span>
            <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-.02em', marginTop: 9 }}>情報理論</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 14px', marginTop: 8, fontSize: 12.5, color: 'rgba(255,255,255,.88)' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7.5V12l3 2" /></svg>
                <span style={{ fontFamily: 'var(--font-mono)' }}>10:40–12:10</span>
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round"><path d="M12 21s-6-5.3-6-10a6 6 0 1 1 12 0c0 4.7-6 10-6 10z" /><circle cx="12" cy="11" r="2.3" /></svg>2号館 2401
              </span>
              <span>佐藤 健 准教授</span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 9 }}>
            <Link href="/attendance" style={{ flex: 1, height: 42, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 12, background: '#fff', color: '#15171A', fontSize: 14, fontWeight: 700, textDecoration: 'none', whiteSpace: 'nowrap' }}>出席する</Link>
            <Link href="/map" style={{ flex: 1, height: 42, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 12, border: '1px solid rgba(255,255,255,.28)', background: 'rgba(255,255,255,.12)', color: '#fff', fontSize: 13, fontWeight: 600, textDecoration: 'none', whiteSpace: 'nowrap' }}>教室マップ</Link>
          </div>
        </div>
      </div>

      {/* 今日の時間割 */}
      <section style={{ ...card, padding: '6px 20px 10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '15px 0 7px' }}>
          <span style={{ fontSize: 15, fontWeight: 700 }}>今日の時間割</span>
          <Link href="/timetable" style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink)', textDecoration: 'none' }}>週表示へ →</Link>
        </div>
        {todayClasses.map((c, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '12px 0', borderTop: '1px solid var(--line)' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5, color: 'var(--ink-2)', width: 96, flex: 'none' }}>{c.start} – {c.end}</div>
            <div style={{ width: 3, height: 34, borderRadius: 2, background: c.dot, flex: 'none' }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14.5, fontWeight: 600 }}>{c.name}</div>
              <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 1 }}>{c.meta}</div>
            </div>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 600, padding: '4px 11px', borderRadius: 999, background: c.stBg, color: c.stFg, border: `1px solid ${c.stBorder}`, flex: 'none' }}>
              {c.live && <span style={{ width: 6, height: 6, borderRadius: 999, background: c.stFg }} />}
              {c.stLabel}
            </span>
          </div>
        ))}
      </section>

        </div>
        <div className="ctp-col">
      {/* お知らせ */}
      <section style={{ ...card, padding: '6px 18px 12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '15px 0 5px' }}>
          <span style={{ fontSize: 15, fontWeight: 700 }}>お知らせ</span>
          <Link href="/notifications" style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink)', textDecoration: 'none' }}>すべて →</Link>
        </div>
        {newsTop.map((n, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 11, padding: '8px 0', borderTop: '1px solid var(--line)' }}>
            <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 7, background: n.tagBg, color: n.tagFg, border: `1px solid ${n.tagBorder}`, flex: 'none', marginTop: 1 }}>{n.tag}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.45 }}>{n.title}</div>
              <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 3 }}>{n.foot}</div>
            </div>
          </div>
        ))}
      </section>

      {/* 出席サマリー */}
      <section style={{ ...card, padding: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 15, fontWeight: 700 }}>出席サマリー</span>
          <Link href="/status" style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink)', textDecoration: 'none' }}>詳細 →</Link>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 14 }}>
          <div style={{ position: 'relative', width: 62, height: 62, borderRadius: 999, background: 'conic-gradient(var(--ink) 88%, var(--surface-2) 0)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
            <div style={{ width: 48, height: 48, borderRadius: 999, background: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 15 }}>88<span style={{ fontSize: 9 }}>%</span></span>
            </div>
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700 }}>全体 良好</div>
            <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 2 }}>全10科目 · 要注意 {riskCourses.length}科目</div>
          </div>
        </div>
        {riskCourses.map((c, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 11, padding: '11px 13px', borderRadius: 12, background: c.cardBg, border: `1px solid ${c.cardBorder}` }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: c.nameColor, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flex: 'none' }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700, color: c.pctColor }}>{c.pctText}</span>
              <span style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: c.stBg, color: c.stFg, border: `1px solid ${c.stBorder}` }}>{c.stLabel}</span>
            </span>
          </div>
        ))}
      </section>
        </div>
      </div>
    </div>
  );
}
