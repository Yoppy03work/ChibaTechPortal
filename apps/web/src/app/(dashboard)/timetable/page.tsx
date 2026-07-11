/**
 * 時間割 — 設計 isTt 画面（週表示グリッド）・実データ版。
 *
 * WHY: Server Component で Prisma から取得し SSR。今日列と進行中コマは JST 基準で
 * ハイライト。実データにはカテゴリが無いため、左バーは科目名ハッシュの濃淡
 * （portal-view.classTier）で安定した見た目にする。
 */
import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { getJstParts, PERIOD_START_TIMES, PERIOD_MINUTES } from '@chibatech/shared';
import { getWeekGrid, periodList } from '@/lib/portal-data';
import { classTier } from '@/lib/portal-view';

export const dynamic = 'force-dynamic';

const GRID_COLS = '24px repeat(6,1fr)';
const DAY_LABELS = ['月', '火', '水', '木', '金', '土'];
const CLASS_MINUTES = PERIOD_MINUTES;

export default async function TimetablePage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');

  const { grid, maxPeriod } = await getWeekGrid(session.user.id);
  const periods = periodList(maxPeriod);

  const jst = getJstParts(new Date());
  const todayCol = jst.dayOfWeek >= 1 && jst.dayOfWeek <= 6 ? jst.dayOfWeek - 1 : -1;
  const nowMin = jst.hour * 60 + jst.minute;
  // 進行中の時限（今日列のみハイライト）
  let livePeriodIndex = -1;
  for (let p = 1; p <= maxPeriod; p++) {
    const t = PERIOD_START_TIMES[p];
    if (!t) continue;
    const start = t.hour * 60 + t.minute;
    if (nowMin >= start && nowMin < start + CLASS_MINUTES) {
      livePeriodIndex = p - 1;
      break;
    }
  }

  const isEmpty = grid.every((day) => day.every((c) => c === null));

  return (
    <div className="ctp-screen" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ overflow: 'hidden', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 18, padding: 16, boxShadow: 'var(--shadow-card)' }}>
        {/* 曜日ヘッダー */}
        <div style={{ display: 'grid', gridTemplateColumns: GRID_COLS, gap: 3, marginBottom: 3 }}>
          <div />
          {DAY_LABELS.map((label, i) => {
            const today = i === todayCol;
            return (
              <div key={label} style={{ textAlign: 'center', fontSize: 11, fontWeight: 700, padding: '5px 0', borderRadius: 7, color: today ? 'var(--ink)' : 'var(--ink-2)', background: today ? 'var(--ttable-today)' : 'transparent' }}>
                {label}
              </div>
            );
          })}
        </div>

        {/* 時限行 */}
        {periods.map((per, pi) => (
          <div key={per.p} style={{ display: 'grid', gridTemplateColumns: GRID_COLS, gap: 3, marginTop: 3 }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-2)', fontFamily: 'var(--font-mono)' }}>{per.p}</span>
              <span style={{ fontSize: 8, color: 'var(--ink-3)', fontFamily: 'var(--font-mono)' }}>{per.t}</span>
            </div>
            {grid.map((dayArr, di) => {
              const c = dayArr[pi];
              const now = di === todayCol && pi === livePeriodIndex && !!c;
              const bg = !c ? 'transparent' : now ? 'var(--ink)' : 'var(--surface-2)';
              const fg = !c ? 'var(--ink-3)' : now ? 'var(--surface)' : 'var(--ink)';
              const border = !c ? '1px dashed var(--line)' : now ? '1px solid var(--ink)' : '1px solid var(--line)';
              const ring = now ? '0 8px 18px -8px rgba(0,0,0,.45)' : 'none';
              const bar = !c || now ? 'transparent' : classTier(c.name);
              return (
                <div key={di} style={{ position: 'relative', height: 60, borderRadius: 8, padding: '5px 4px 5px 8px', background: bg, color: fg, border, boxShadow: ring, overflow: 'hidden', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 2 }}>
                  <span style={{ position: 'absolute', left: 3, top: 6, bottom: 6, width: 2.5, borderRadius: 2, background: bar }} />
                  <div style={{ fontSize: 8, fontWeight: 700, lineHeight: 1.15, overflow: 'hidden' }}>{c?.name ?? ''}</div>
                  <div style={{ fontSize: 7, opacity: 0.72, fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c?.room ?? ''}</div>
                </div>
              );
            })}
          </div>
        ))}

        {isEmpty && (
          <div style={{ marginTop: 12, padding: '12px 4px 4px', borderTop: '1px solid var(--line)', fontSize: 13, color: 'var(--ink-3)', lineHeight: 1.7 }}>
            時間割が未登録です。設定から CIT Portal を連携すると自動で取り込まれます。
          </div>
        )}
      </div>

      {/* 凡例 */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10px 18px', padding: '0 4px' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12, color: 'var(--ink-2)' }}>
          <span style={{ width: 10, height: 10, borderRadius: 3, background: 'var(--ink)', boxShadow: '0 0 0 2px var(--ink)' }} />
          現在の授業
        </span>
        <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>左バーの濃淡は科目ごとの識別色</span>
      </div>
    </div>
  );
}
