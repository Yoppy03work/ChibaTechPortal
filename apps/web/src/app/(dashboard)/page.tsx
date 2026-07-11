/**
 * ホーム（ダッシュボード）— 設計 isHome 画面・実データ版。
 *
 * WHY: Server Component で時間割・お知らせ・出席状況を DB から取得し SSR で即表示。
 * 表示の状態判定（進行中/次/予定）は JST 基準（portal-data）。データが無い場合は
 * 空状態メッセージを出す（初回ユーザー・スクレイプ未連携でも壊れない）。
 */
import Link from 'next/link';
import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { getJstParts } from '@chibatech/shared';
import {
  getTodayClasses,
  getNotifications,
  getUnreadCount,
  getAttendanceOverview,
  type TodayClassRow,
} from '@/lib/portal-data';
import { attendanceStyle } from '@/lib/portal-view';

// WHY: 個人データを含むSSRページ。キャッシュ禁止
export const dynamic = 'force-dynamic';

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

// 今日の時間割の行チップ表示
function rowChip(c: TodayClassRow) {
  if (c.status === 'live') return { dot: 'var(--ink-2)', stLabel: '進行中', stBg: 'var(--ink)', stFg: 'var(--surface)', stBorder: 'var(--ink)', live: true };
  if (c.status === 'next') return { dot: 'var(--ink)', stLabel: '次', stBg: 'transparent', stFg: 'var(--ink)', stBorder: 'var(--ink-2)', live: false };
  if (c.status === 'done') return { dot: 'var(--ink-3)', stLabel: '終了', stBg: 'var(--surface-2)', stFg: 'var(--ink-3)', stBorder: 'transparent', live: false };
  return { dot: 'var(--ink-3)', stLabel: '予定', stBg: 'var(--surface-2)', stFg: 'var(--ink-3)', stBorder: 'transparent', live: false };
}

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');
  const userId = session.user.id;

  const now = new Date();
  const [today, news, unread, weekStats, termStats] = await Promise.all([
    getTodayClasses(userId, now),
    getNotifications(userId, 8, now),
    getUnreadCount(userId),
    getAttendanceOverview(userId, 7),
    getAttendanceOverview(userId, 120),
  ]);

  // 次の授業ヒーロー: 「次」があれば優先、なければ進行中
  const heroRow = today.find((t) => t.status === 'next') ?? today.find((t) => t.status === 'live') ?? null;
  const jstNow = getJstParts(now);
  const nowMin = jstNow.hour * 60 + jstNow.minute;
  const heroCountdown = heroRow && heroRow.status === 'next' ? heroRow.startMin - nowMin : 0;

  const riskCourses = termStats.courses.filter((c) => c.pct < 80).slice(0, 2);
  const ringPct = termStats.overallPct;

  return (
    <div className="ctp-screen" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* 統計3枚 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
        <Stat label="今日の授業" value={String(today.length)} unit="コマ" />
        <Stat label="今週の出席率" value={weekStats.overallPct != null ? String(weekStats.overallPct) : '—'} unit="%" unitBig />
        <Stat label="未読お知らせ" value={String(unread)} unit="件" />
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
              {heroRow ? (
                <>
                  <div>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 11, fontWeight: 600, letterSpacing: '.05em', background: 'rgba(255,255,255,.14)', padding: '5px 11px', borderRadius: 999 }}>
                      <span style={{ width: 7, height: 7, borderRadius: 999, background: '#fff' }} />
                      {heroRow.status === 'live' ? '進行中の授業' : heroCountdown > 0 ? `次の授業 · あと${heroCountdown}分` : '次の授業'}
                    </span>
                    <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-.02em', marginTop: 9 }}>{heroRow.name}</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 14px', marginTop: 8, fontSize: 12.5, color: 'rgba(255,255,255,.88)' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7.5V12l3 2" /></svg>
                        <span style={{ fontFamily: 'var(--font-mono)' }}>{heroRow.start}–{heroRow.end}</span>
                      </span>
                      {heroRow.room && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round"><path d="M12 21s-6-5.3-6-10a6 6 0 1 1 12 0c0 4.7-6 10-6 10z" /><circle cx="12" cy="11" r="2.3" /></svg>
                          {heroRow.room}
                        </span>
                      )}
                      {heroRow.teacher && <span>{heroRow.teacher}</span>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 9 }}>
                    <Link href="/attendance" style={{ flex: 1, height: 42, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 12, background: '#fff', color: '#15171A', fontSize: 14, fontWeight: 700, textDecoration: 'none', whiteSpace: 'nowrap' }}>出席する</Link>
                    <Link href="/campus" style={{ flex: 1, height: 42, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 12, border: '1px solid rgba(255,255,255,.28)', background: 'rgba(255,255,255,.12)', color: '#fff', fontSize: 13, fontWeight: 600, textDecoration: 'none', whiteSpace: 'nowrap' }}>教室マップ</Link>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 11, fontWeight: 600, letterSpacing: '.05em', background: 'rgba(255,255,255,.14)', padding: '5px 11px', borderRadius: 999 }}>
                      <span style={{ width: 7, height: 7, borderRadius: 999, background: '#fff' }} />次の授業
                    </span>
                    <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-.02em', marginTop: 9 }}>
                      {today.length > 0 ? '今日の授業はすべて終了しました' : '今日の授業はありません'}
                    </div>
                    <div style={{ marginTop: 8, fontSize: 12.5, color: 'rgba(255,255,255,.7)' }}>
                      {today.length === 0 ? '時間割が未登録の場合は設定から CIT Portal 連携で自動取得できます。' : 'おつかれさまでした。'}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 9 }}>
                    <Link href="/timetable" style={{ flex: 1, height: 42, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 12, background: '#fff', color: '#15171A', fontSize: 14, fontWeight: 700, textDecoration: 'none', whiteSpace: 'nowrap' }}>週の時間割</Link>
                    <Link href="/campus" style={{ flex: 1, height: 42, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 12, border: '1px solid rgba(255,255,255,.28)', background: 'rgba(255,255,255,.12)', color: '#fff', fontSize: 13, fontWeight: 600, textDecoration: 'none', whiteSpace: 'nowrap' }}>教室マップ</Link>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* 今日の時間割 */}
          <section style={{ ...card, padding: '6px 20px 10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '15px 0 7px' }}>
              <span style={{ fontSize: 15, fontWeight: 700 }}>今日の時間割</span>
              <Link href="/timetable" style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink)', textDecoration: 'none' }}>週表示へ →</Link>
            </div>
            {today.length === 0 && (
              <div style={{ padding: '14px 0', borderTop: '1px solid var(--line)', fontSize: 13, color: 'var(--ink-3)' }}>今日の授業はありません</div>
            )}
            {today.map((c) => {
              const chip = rowChip(c);
              return (
                <div key={c.timetableId} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '12px 0', borderTop: '1px solid var(--line)' }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5, color: 'var(--ink-2)', width: 96, flex: 'none' }}>{c.start} – {c.end}</div>
                  <div style={{ width: 3, height: 34, borderRadius: 2, background: chip.dot, flex: 'none' }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14.5, fontWeight: 600 }}>{c.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 1 }}>{[c.room || `${c.period}限`, c.teacher].filter(Boolean).join(' · ')}</div>
                  </div>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 600, padding: '4px 11px', borderRadius: 999, background: chip.stBg, color: chip.stFg, border: `1px solid ${chip.stBorder}`, flex: 'none' }}>
                    {chip.live && <span style={{ width: 6, height: 6, borderRadius: 999, background: chip.stFg }} />}
                    {chip.stLabel}
                  </span>
                </div>
              );
            })}
          </section>
        </div>

        <div className="ctp-col">
          {/* お知らせ */}
          <section style={{ ...card, padding: '6px 18px 12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '15px 0 5px' }}>
              <span style={{ fontSize: 15, fontWeight: 700 }}>お知らせ</span>
              <Link href="/notifications" style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink)', textDecoration: 'none' }}>すべて →</Link>
            </div>
            {news.length === 0 && (
              <div style={{ padding: '14px 0', borderTop: '1px solid var(--line)', fontSize: 13, color: 'var(--ink-3)' }}>
                お知らせはまだありません。設定から CIT Portal / manaba を連携すると自動取得されます。
              </div>
            )}
            {news.map((n) => (
              <Link key={n.id} href={`/notifications/${n.id}`} style={{ display: 'flex', alignItems: 'flex-start', gap: 11, padding: '8px 0', borderTop: '1px solid var(--line)', textDecoration: 'none', color: 'var(--ink)' }}>
                <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 7, background: 'transparent', color: 'var(--ink-2)', border: '1px solid var(--line-2)', flex: 'none', marginTop: 1 }}>{n.channelLabel}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: n.unread ? 700 : 600, lineHeight: 1.45 }}>{n.title}</div>
                  <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 3 }}>{n.time}</div>
                </div>
                {n.unread && <span style={{ width: 7, height: 7, borderRadius: 999, background: 'var(--ink)', marginTop: 6, flex: 'none' }} />}
              </Link>
            ))}
          </section>

          {/* 出席サマリー */}
          <section style={{ ...card, padding: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 15, fontWeight: 700 }}>出席サマリー</span>
              <Link href="/status" style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink)', textDecoration: 'none' }}>詳細 →</Link>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 14 }}>
              <div style={{ position: 'relative', width: 62, height: 62, borderRadius: 999, background: `conic-gradient(var(--ink) ${ringPct ?? 0}%, var(--surface-2) 0)`, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
                <div style={{ width: 48, height: 48, borderRadius: 999, background: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 15 }}>{ringPct != null ? <>{ringPct}<span style={{ fontSize: 9 }}>%</span></> : '—'}</span>
                </div>
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700 }}>
                  {ringPct == null ? '記録なし' : ringPct >= 80 ? '全体 良好' : ringPct >= 67 ? '全体 注意' : '全体 危険'}
                </div>
                <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 2 }}>
                  {ringPct == null ? '出席を記録するとここに表示されます' : `記録${termStats.courses.length}科目 · 要注意 ${termStats.courses.filter((c) => c.pct < 80).length}科目`}
                </div>
              </div>
            </div>
            {riskCourses.map((c) => {
              const s = attendanceStyle(c.pct);
              return (
                <div key={c.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 11, padding: '11px 13px', borderRadius: 12, background: s.cardBg, border: `1px solid ${s.cardBorder}` }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: s.nameColor, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flex: 'none' }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700, color: s.pctColor }}>{c.pct}%</span>
                    <span style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: s.stBg, color: s.stFg, border: `1px solid ${s.stBorder}` }}>{s.stLabel}</span>
                  </span>
                </div>
              );
            })}
          </section>
        </div>
      </div>
    </div>
  );
}
