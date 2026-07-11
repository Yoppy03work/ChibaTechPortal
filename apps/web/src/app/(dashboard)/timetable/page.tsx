/**
 * 時間割 — 設計 isTt 画面（週表示グリッド）。
 *
 * WHY: フェーズ1は見た目優先・モック。設計どおり 6日×5時限のグリッドを描画する。
 * 実データ版（Prisma + 編集）は timetable-grid.tsx に温存してあり、後段で本デザインへ
 * 接続する。timetableGrid[day][period] を「時限を行・曜日を列」に転置して描画する。
 */
import {
  timetableGrid,
  periods,
  ttDayLabels,
  todayCol,
  nowPeriodIndex,
  tierBar,
} from '@/lib/portal-mock';

const GRID_COLS = '24px repeat(6,1fr)';

export default function TimetablePage() {
  return (
    <div className="ctp-screen" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ overflow: 'hidden', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 18, padding: 16, boxShadow: 'var(--shadow-card)' }}>
        {/* 曜日ヘッダー */}
        <div style={{ display: 'grid', gridTemplateColumns: GRID_COLS, gap: 3, marginBottom: 3 }}>
          <div />
          {ttDayLabels.map((label, i) => {
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
            {timetableGrid.map((dayArr, di) => {
              const c = dayArr[pi];
              const now = di === todayCol && pi === nowPeriodIndex;
              const bg = !c ? 'transparent' : now ? 'var(--ink)' : 'var(--surface-2)';
              const fg = !c ? 'var(--ink-3)' : now ? 'var(--surface)' : 'var(--ink)';
              const border = !c ? '1px dashed var(--line)' : now ? '1px solid var(--ink)' : '1px solid var(--line)';
              const ring = now ? '0 8px 18px -8px rgba(0,0,0,.45)' : 'none';
              const bar = !c || now ? 'transparent' : tierBar(c.cat);
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
      </div>

      {/* 凡例 */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10px 18px', padding: '0 4px' }}>
        {[
          { label: '専門', c: 'var(--ink)' },
          { label: '数理', c: 'var(--ink-2)' },
          { label: '演習・語学・他', c: 'var(--ink-3)' },
        ].map((l) => (
          <span key={l.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12, color: 'var(--ink-2)' }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: l.c }} />
            {l.label}
          </span>
        ))}
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12, color: 'var(--ink-2)' }}>
          <span style={{ width: 10, height: 10, borderRadius: 3, background: 'var(--ink)', boxShadow: '0 0 0 2px var(--ink)' }} />
          現在の授業
        </span>
      </div>
    </div>
  );
}
