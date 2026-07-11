/**
 * 出席状況 — 設計 isAtt 画面（出席率サマリー + 科目別）。
 *
 * WHY: 本アプリの /attendance は実際の QR/出席登録フローなので触らず、設計の
 * 読み取り専用「出席状況」はこの /status に配置する。フェーズ1はモックデータ。
 */
import { attendanceCourses, riskCourses } from '@/lib/portal-mock';
import { ManualAttendance } from '@/components/manual-attendance';

const totalAbsent = attendanceCourses.reduce((s, c) => s + c.absent, 0);

export default function StatusPage() {
  return (
    <div className="ctp-screen" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* ヒーロー：全体の出席率 */}
      <div style={{ position: 'relative', overflow: 'hidden', display: 'flex', alignItems: 'center', gap: 22, borderRadius: 20, padding: '22px 26px', color: '#fff', background: 'linear-gradient(140deg,#23262B 0%, #15171A 55%, #0E0F11 100%)', border: '1px solid rgba(255,255,255,.07)', boxShadow: '0 18px 38px -20px rgba(10,12,15,.6)' }}>
        <div aria-hidden="true" style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(255,255,255,.05) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.05) 1px,transparent 1px)', backgroundSize: '22px 22px' }} />
        <div style={{ position: 'relative', width: 88, height: 88, borderRadius: 999, background: 'conic-gradient(#fff 88%, rgba(255,255,255,.18) 0)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
          <div style={{ width: 68, height: 68, borderRadius: 999, background: '#15171A', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 21, color: '#fff' }}>88<span style={{ fontSize: 11 }}>%</span></span>
          </div>
        </div>
        <div style={{ position: 'relative' }}>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,.7)', fontWeight: 500 }}>全体の出席率</div>
          <div style={{ fontSize: 22, fontWeight: 700, marginTop: 3 }}>良好です</div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,.7)', marginTop: 4 }}>全{attendanceCourses.length}科目 · 欠席 {totalAbsent}回 · 要注意 {riskCourses.length}科目</div>
        </div>
      </div>

      {/* 手動出席 */}
      <ManualAttendance />

      {/* 科目別（表示幅で 1/2/3 列） */}
      <div className="ctp-cards">
        {attendanceCourses.map((c, i) => (
          <div key={i} style={{ background: c.cardBg, border: `1px solid ${c.cardBorder}`, borderRadius: 15, padding: '15px 16px', boxShadow: 'var(--shadow-sm)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
                <span style={{ width: 8, height: 8, borderRadius: 999, background: c.dotColor, flex: 'none' }} />
                <span style={{ fontSize: 14, fontWeight: 600, color: c.nameColor, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</span>
              </div>
              <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 999, background: c.stBg, color: c.stFg, border: `1px solid ${c.stBorder}`, flex: 'none' }}>{c.stLabel}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginTop: 13 }}>
              <div style={{ flex: 1, height: 7, borderRadius: 999, background: c.barTrack, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${c.pct}%`, borderRadius: 999, background: c.barColor }} />
              </div>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700, color: c.pctColor }}>{c.pctText}</span>
            </div>
            <div style={{ display: 'flex', gap: 16, marginTop: 9, fontSize: 11.5, color: c.subColor }}>
              <span>出席 {c.attended} / {c.total}</span>
              <span>欠席 {c.absent}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
