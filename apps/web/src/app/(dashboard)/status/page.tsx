/**
 * 出席状況 — 設計 isAtt 画面・実データ版（出席率サマリー + 手動出席 + 科目別）。
 *
 * WHY: AttendanceLog(120日) を集計して科目別出席率を表示。手動出席は今日の授業に
 * 対して /api/attendance/manual で記録する。実QR/確認フローの /attendance は別画面。
 */
import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { getAttendanceOverview, getTodayClasses, getTodayAttendedIds } from '@/lib/portal-data';
import { attendanceStyle } from '@/lib/portal-view';
import { ManualAttendance } from '@/components/manual-attendance';

export const dynamic = 'force-dynamic';

export default async function StatusPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');
  const userId = session.user.id;

  const now = new Date();
  const [overview, todayClasses, attendedIds] = await Promise.all([
    getAttendanceOverview(userId, 120),
    getTodayClasses(userId, now),
    getTodayAttendedIds(userId, now),
  ]);
  const pct = overview.overallPct;
  const riskCount = overview.courses.filter((c) => c.pct < 80).length;

  return (
    <div className="ctp-screen" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* ヒーロー：全体の出席率 */}
      <div style={{ position: 'relative', overflow: 'hidden', display: 'flex', alignItems: 'center', gap: 22, borderRadius: 20, padding: '22px 26px', color: '#fff', background: 'linear-gradient(140deg,#23262B 0%, #15171A 55%, #0E0F11 100%)', border: '1px solid rgba(255,255,255,.07)', boxShadow: '0 18px 38px -20px rgba(10,12,15,.6)' }}>
        <div aria-hidden="true" style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(255,255,255,.05) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.05) 1px,transparent 1px)', backgroundSize: '22px 22px' }} />
        <div style={{ position: 'relative', width: 88, height: 88, borderRadius: 999, background: `conic-gradient(#fff ${pct ?? 0}%, rgba(255,255,255,.18) 0)`, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
          <div style={{ width: 68, height: 68, borderRadius: 999, background: '#15171A', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 21, color: '#fff' }}>
              {pct != null ? <>{pct}<span style={{ fontSize: 11 }}>%</span></> : '—'}
            </span>
          </div>
        </div>
        <div style={{ position: 'relative' }}>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,.7)', fontWeight: 500 }}>全体の出席率（直近120日）</div>
          <div style={{ fontSize: 22, fontWeight: 700, marginTop: 3 }}>
            {pct == null ? '記録がありません' : pct >= 80 ? '良好です' : pct >= 67 ? '注意が必要です' : '危険です'}
          </div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,.7)', marginTop: 4 }}>
            {pct == null
              ? '出席を記録するとここに表示されます'
              : `記録${overview.courses.length}科目 · 欠席 ${overview.totalAbsent}回 · 要注意 ${riskCount}科目`}
          </div>
        </div>
      </div>

      {/* 手動出席 */}
      <ManualAttendance classes={todayClasses} attendedIds={attendedIds} />

      {/* 科目別（表示幅で 1/2/3 列） */}
      {overview.courses.length > 0 && (
        <div className="ctp-cards">
          {overview.courses.map((c) => {
            const s = attendanceStyle(c.pct);
            return (
              <div key={c.name} style={{ background: s.cardBg, border: `1px solid ${s.cardBorder}`, borderRadius: 15, padding: '15px 16px', boxShadow: 'var(--shadow-sm)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
                    <span style={{ width: 8, height: 8, borderRadius: 999, background: s.dotColor, flex: 'none' }} />
                    <span style={{ fontSize: 14, fontWeight: 600, color: s.nameColor, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</span>
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 999, background: s.stBg, color: s.stFg, border: `1px solid ${s.stBorder}`, flex: 'none' }}>{s.stLabel}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginTop: 13 }}>
                  <div style={{ flex: 1, height: 7, borderRadius: 999, background: s.barTrack, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${c.pct}%`, borderRadius: 999, background: s.barColor }} />
                  </div>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700, color: s.pctColor }}>{c.pct}%</span>
                </div>
                <div style={{ display: 'flex', gap: 16, marginTop: 9, fontSize: 11.5, color: s.subColor }}>
                  <span>出席 {c.attended} / {c.total}</span>
                  <span>欠席 {c.absent}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
