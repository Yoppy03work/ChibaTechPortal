'use client';

/**
 * 交通ダイヤ — 設計 isBus 画面（スクールバス + 電車の時刻表）。
 *
 * WHY: 設計の transit ロジック（バス/電車、平日/土日祝、次発カウントダウン、
 * 時刻表ハイライト）をそのまま移植。基準時刻 NOW はマウント後に実時刻へ更新する
 * （SSR とのハイドレーション不一致を避けるため初期値は設計と同じ 10:22）。
 */
import { useEffect, useState } from 'react';

type Entry = number | Array<number | string | null>;
type Table = Record<number, Entry[]>;

const DEFAULT_NOW = 10 * 60 + 22; // 10:22（設計の基準時刻）

/* ── バス（キャンパス間シャトル） ─────────────────────── */
const BUSDEST: Record<string, { name: string; ride: string; table: Table }> = {
  tsudanuma: { name: '津田沼キャンパス', ride: '約15分', table: { 8: [0, 20, 40], 9: [0, 30], 10: [0, 30], 11: [0, 30], 12: [0, 30], 13: [0, 30], 14: [0, 30], 15: [0, 30], 16: [0, 20, 40], 17: [0, 20, 40], 18: [0, 30], 19: [0] } },
  shinnarashino: { name: '新習志野キャンパス', ride: '約15分', table: { 8: [10, 30, 50], 9: [15, 45], 10: [15, 45], 11: [15, 45], 12: [15, 45], 13: [15, 45], 14: [15, 45], 15: [15, 45], 16: [10, 30, 50], 17: [10, 30, 50], 18: [15, 45], 19: [15] } },
  akanehama: { name: '茜浜運動場', ride: '約8分', table: { 9: [0, 30], 10: [0, 30], 11: [0], 12: [0], 13: [0, 30], 14: [0, 30], 15: [0, 30], 16: [0, 30], 17: [0, 30], 18: [0] } },
};

/* ── 電車（駅別ダイヤ） ───────────────────────────────── */
function mkT(am: Entry[], day: Entry[], pm: Entry[], eve: Entry[]): Table {
  const o: Table = {};
  for (let h = 7; h <= 8; h++) o[h] = am;
  for (let h = 9; h <= 16; h++) o[h] = day;
  for (let h = 17; h <= 19; h++) o[h] = pm;
  for (let h = 20; h <= 22; h++) o[h] = eve;
  return o;
}

type Dir = { label: string; defDest: string; defType?: string; table: Table };
type Line = { line: string; sta: string; remark: string; lg: Array<[string, number, string]>; note: string; dirs: Dir[] };

const LINES: Record<string, Line> = {
  keiyo: { line: 'JR京葉線', sta: '新習志野駅', remark: '武蔵野線直通あり', lg: [['武', 1, '武蔵野線直通（西船橋経由 府中本町ゆき）']], note: '無印＝各駅停車', dirs: [
    { label: '東京方面', defDest: '東京', table: mkT([4, [10, 'mus', '府中本町'], 16, 28, [34, 'mus', '府中本町'], 40, 52], [6, [21, 'mus', '府中本町'], 36, 51], [3, 15, [27, 'mus', '府中本町'], 39, 51], [0, [20, 'mus', '府中本町'], 40]) },
    { label: '蘇我方面', defDest: '蘇我', table: mkT([8, 24, [40, null, '海浜幕張'], 56], [12, [32, null, '海浜幕張'], 52], [0, 16, 32, [48, null, '海浜幕張']], [4, 34]) },
  ] },
  sobuL: { line: '総武線各駅停車', sta: '津田沼駅', remark: '東西線直通あり（平日朝夕）', lg: [['東西', 1, '東西線直通（西船橋から地下鉄東西線経由 中野ゆき）· 平日のみ']], note: '無印＝各駅停車', dirs: [
    { label: '中野・三鷹方面', defDest: '三鷹', table: mkT([1, [7, 'toz', '中野'], 13, 21, [27, 'toz', '中野'], 33, 41, 49, 57], [3, 18, 33, 48], [0, [12, 'toz', '中野'], 24, 36, [48, 'toz', '中野']], [2, 22, 42]) },
    { label: '千葉方面', defDest: '千葉', table: mkT([6, 14, 22, 30, 38, 46, 54], [8, 23, 38, 53], [2, 14, 26, 38, 50], [8, 28, 48]) },
  ] },
  sobuR: { line: '総武快速線', sta: '津田沼駅', remark: '全列車 快速運転', lg: [['快', 0, '快速（東京から横須賀線へ直通する便あり）']], note: '全列車が快速運転です', dirs: [
    { label: '東京・横須賀線方面', defDest: '東京', defType: 'kai', table: mkT([0, [11, null, '久里浜'], 22, 33, [44, null, '大船'], 55], [[2, null, '久里浜'], 17, [32, null, '逗子'], 47], [5, [20, null, '逗子'], 35, 50], [10, 40]) },
    { label: '千葉・成田方面', defDest: '千葉', defType: 'kai', table: mkT([4, 16, 28, 40, 52], [9, [24, null, '成田空港'], 39, [54, null, '君津']], [8, [23, null, '成田空港'], 38, 53], [12, 42]) },
  ] },
  matsudoShin: { line: '京成松戸線', sta: '新津田沼駅', remark: '旧新京成線 · 全列車各駅停車', lg: [], note: '全列車 各駅停車（松戸 ⇄ 京成津田沼 · 一部 千葉線直通）', dirs: [
    { label: '松戸方面', defDest: '松戸', table: mkT([0, 10, 20, 30, 40, 50], [2, 22, 42], [2, 14, 26, 38, 50], [0, 25, 50]) },
    { label: '京成津田沼方面', defDest: '京成津田沼', table: mkT([6, 16, 26, 36, 46, 56], [[8, null, 'ちはら台'], 28, 48], [8, 20, 32, 44, 56], [6, 31, 56]) },
  ] },
  keiseiMain: { line: '京成本線', sta: '京成津田沼駅', remark: '快特・特急・通特・快速 運転', lg: [['快特', 0, '快速特急（最速・主要駅のみ停車）'], ['特', 0, '特急'], ['通特', 0, '通勤特急 · 平日朝のみ'], ['快', 0, '快速']], note: '無印＝普通 · 西馬込ゆきは都営浅草線直通', dirs: [
    { label: '京成上野・都心方面', defDest: '京成上野', table: mkT([[3, 'tsu'], [13, 'kt'], [23, 'kai', '西馬込'], 33, [43, 'tok'], 53], [[5, 'kt'], 20, [35, 'kai', '西馬込'], 50], [[2, 'tok'], 17, [32, 'kai', '西馬込'], [47, 'kt']], [[4, 'tok'], 34]) },
    { label: '成田・成田空港方面', defDest: '成田空港', table: mkT([9, [19, 'kt'], [29, 'tok'], 39, 49, 59], [[11, 'tok'], [26, null, 'うすい'], 41, [56, null, 'うすい']], [[8, 'kt'], 23, [38, 'tok'], [53, null, 'うすい']], [10, [40, 'tok']]) },
  ] },
  keiseiChiba: { line: '京成千葉線', sta: '京成津田沼駅', remark: '松戸線と直通運転あり', lg: [], note: '全列車 普通 · 一部は松戸線から直通', dirs: [
    { label: '千葉中央・ちはら台方面', defDest: 'ちはら台', table: mkT([5, 17, 29, 41, 53], [[9, null, '千葉中央'], 29, 49], [7, 22, 37, 52], [15, 45]) },
  ] },
  matsudoKeisei: { line: '京成松戸線', sta: '京成津田沼駅', remark: '当駅始発 · 全列車各駅停車', lg: [], note: '全列車 各駅停車 · 当駅始発', dirs: [
    { label: '松戸方面', defDest: '松戸', table: mkT([2, 12, 22, 32, 42, 52], [14, 34, 54], [4, 16, 28, 40, 52], [12, 37]) },
  ] },
};

const TYPCH: Record<string, string> = { tok: '特', kai: '快', mus: '武', toz: '東西', kt: '快特', tsu: '通特' };
const TYPLONG: Record<string, string> = { tok: '特急', kai: '快速', mus: '武蔵野線直通', toz: '東西線直通', kt: '快速特急', tsu: '通勤特急' };

type Norm = { mm: number; ty: string | null; ds: string | null };
function normE(x: Entry): Norm {
  return Array.isArray(x)
    ? { mm: x[0] as number, ty: (x[1] as string) || null, ds: (x[2] as string) || null }
    : { mm: x, ty: null, ds: null };
}

// 土日祝の電車：直通(東西/通特)を除外し、ラッシュ時間帯は本数を間引く
function wkOf(tb: Table): Table {
  const o: Table = {};
  Object.keys(tb).forEach((hk) => {
    const hh = +hk;
    let arr = tb[hh].map(normE).filter((en) => en.ty !== 'toz' && en.ty !== 'tsu');
    if ((hh >= 7 && hh <= 8) || (hh >= 17 && hh <= 19)) arr = arr.filter((_, i) => i % 2 === 0);
    if (arr.length) o[hh] = arr.map((en) => [en.mm, en.ty, en.ds] as Entry);
  });
  return o;
}

const tfmt = (t: number) => `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;

/* ── 小さな UI ヘルパー ───────────────────────────────── */
const cardBase: React.CSSProperties = { overflow: 'hidden', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 18, boxShadow: 'var(--shadow-card)' };

export default function BusPage() {
  const [now, setNow] = useState(DEFAULT_NOW);
  const [mode, setMode] = useState<'bus' | 'train'>('bus');
  const [dia, setDia] = useState<'wd' | 'we'>('wd');
  const [busDest, setBusDest] = useState('tsudanuma');
  const [trainStation, setTrainStation] = useState('keiyo');
  const [trainDir, setTrainDir] = useState(0);

  // マウント後に実時刻へ（SSR一致のため初期は DEFAULT_NOW）
  useEffect(() => {
    const d = new Date();
    setNow(d.getHours() * 60 + d.getMinutes());
  }, []);

  const isBus = mode === 'bus';
  const isWE = dia === 'we';

  // アクティブなダイヤと表示情報を決定
  let activeTable: Table = {};
  let headline = '';
  let line = '';
  let tableLabel = '';
  let ride = '';
  let lineName = '';
  let remark = '';
  let defDest = '';
  let defType: string | null = null;
  let chips: Array<{ name: string; subText: string; onClick: () => void; active: boolean }> = [];
  let dirBtns: Array<{ label: string; onClick: () => void; active: boolean }> = [];
  let legendItems: Array<{ b: string; txt: string; solid: boolean }> = [];
  let legendNote = '';

  if (isBus) {
    const d = BUSDEST[busDest] || BUSDEST.tsudanuma;
    activeTable = isWE ? {} : d.table;
    headline = '次のバス';
    line = `${d.name}ゆき`;
    tableLabel = `${d.name}ゆき`;
    ride = d.ride;
    chips = ['tsudanuma', 'shinnarashino', 'akanehama'].map((k) => ({ name: BUSDEST[k].name, subText: BUSDEST[k].ride, onClick: () => setBusDest(k), active: busDest === k }));
  } else {
    const sk = LINES[trainStation] ? trainStation : 'keiyo';
    const st = LINES[sk];
    const di = st.dirs[trainDir] ? trainDir : 0;
    const dir = st.dirs[di];
    activeTable = isWE ? wkOf(dir.table) : dir.table;
    headline = '次の電車';
    line = `${st.line} · ${st.sta}`;
    tableLabel = `${st.line} ${dir.label}`;
    lineName = st.line;
    remark = st.remark;
    defDest = dir.defDest;
    defType = dir.defType || null;
    legendItems = st.lg.map((g) => ({ b: g[0], solid: !!g[1], txt: g[2] }));
    legendNote = `${st.note} · 各便の下は行き先`;
    chips = ['keiyo', 'sobuL', 'sobuR', 'matsudoShin', 'keiseiMain', 'keiseiChiba', 'matsudoKeisei'].map((k) => ({ name: LINES[k].line, subText: LINES[k].sta, onClick: () => { setTrainStation(k); setTrainDir(0); }, active: sk === k }));
    dirBtns = st.dirs.map((dd, i) => ({ label: dd.label, onClick: () => setTrainDir(i), active: i === di }));
  }

  // 次発・カウントダウンの計算
  const thours = Object.keys(activeTable).map(Number).sort((a, b) => a - b);
  const tdeps: Array<{ t: number; ty: string | null; ds: string | null }> = [];
  thours.forEach((h) =>
    activeTable[h]
      .map(normE)
      .sort((a, b) => a.mm - b.mm)
      .forEach((en) => tdeps.push({ t: h * 60 + en.mm, ty: en.ty, ds: en.ds })),
  );
  const nextO = tdeps.find((d) => d.t >= now) || null;
  const next = nextO ? nextO.t : null;
  const afterO = nextO ? tdeps.find((d) => d.t > nextO.t) || null : null;
  const nextTime = next != null ? tfmt(next) : '—';
  const diff = next != null ? next - now : null;
  const busClosed = isBus && isWE;
  const countdown = busClosed ? '土日祝運休' : next == null ? '本日終了' : diff! <= 1 ? 'まもなく' : `あと${diff}分`;
  const afterTxt = afterO ? tfmt(afterO.t) : '—';
  const sub = isBus
    ? busClosed
      ? '土日祝はスクールバス運休です'
      : `所要 ${ride} · 次発 ${afterTxt}`
    : `${nextO ? `${nextO.ty ? TYPLONG[nextO.ty] : defType ? TYPLONG[defType] : '各駅停車'} ${nextO.ds || defDest}ゆき` : '運行終了'} · 次発 ${afterTxt}`;
  const empty = thours.length === 0;

  const segStyle = (active: boolean): React.CSSProperties => ({ background: active ? 'var(--surface)' : 'transparent', color: active ? 'var(--ink)' : 'var(--ink-3)', boxShadow: active ? 'var(--shadow-sm)' : 'none' });

  return (
    <div className="ctp-screen" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* モード切替 */}
      <div style={{ display: 'flex', gap: 6, alignSelf: 'flex-start', background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 12, padding: 4 }}>
        <button type="button" onClick={() => setMode('bus')} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 13, fontWeight: 600, padding: '8px 18px', borderRadius: 9, border: 'none', ...segStyle(isBus) }}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="4" width="16" height="12" rx="2" /><path d="M4 11h16M8 16v2.4M16 16v2.4" /></svg>バス
        </button>
        <button type="button" onClick={() => setMode('train')} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 13, fontWeight: 600, padding: '8px 18px', borderRadius: 9, border: 'none', ...segStyle(!isBus) }}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><rect x="6" y="3" width="12" height="14" rx="3" /><path d="M6 11h12M9.5 7h5M9 20l-2 2M15 20l2 2" /><circle cx="9" cy="14" r="0.9" fill="currentColor" stroke="none" /><circle cx="15" cy="14" r="0.9" fill="currentColor" stroke="none" /></svg>電車
        </button>
      </div>

      {/* 路線・行先チップ */}
      <div className="ctp-chips" style={{ display: 'flex', gap: 9, overflowX: 'auto', padding: '2px 0 4px' }}>
        {chips.map((r, i) => (
          <button key={i} type="button" onClick={r.onClick} style={{ flex: 'none', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2, padding: '6px 11px', borderRadius: 10, background: r.active ? 'var(--ink)' : 'var(--surface)', color: r.active ? 'var(--surface)' : 'var(--ink)', border: `1px solid ${r.active ? 'var(--ink)' : 'var(--line)'}`, minWidth: 120 }}>
            <span style={{ fontSize: 12, fontWeight: 700 }}>{r.name}</span>
            <span style={{ fontSize: 9.5, color: r.active ? 'rgba(255,255,255,.6)' : 'var(--ink-3)' }}>{r.subText}</span>
          </button>
        ))}
      </div>

      {/* 次発ヒーロー + 詳細 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 14 }}>
        <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 18, padding: 16, color: '#fff', background: 'linear-gradient(140deg,#23262B 0%, #15171A 55%, #0E0F11 100%)', border: '1px solid rgba(255,255,255,.07)', boxShadow: '0 18px 38px -20px rgba(10,12,15,.6)' }}>
          <div aria-hidden="true" style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(255,255,255,.05) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.05) 1px,transparent 1px)', backgroundSize: '22px 22px' }} />
          <div style={{ position: 'relative' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 11, fontWeight: 600, letterSpacing: '.05em', background: 'rgba(255,255,255,.14)', padding: '5px 11px', borderRadius: 999 }}>
                <span style={{ width: 7, height: 7, borderRadius: 999, background: '#fff' }} />{headline}
              </span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5, background: 'rgba(0,0,0,.3)', padding: '5px 11px', borderRadius: 999, fontWeight: 600 }}>{countdown}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 16 }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 36, fontWeight: 700, letterSpacing: '-.02em', lineHeight: 1 }}>{nextTime}</span>
              <span style={{ fontSize: 13, color: 'rgba(255,255,255,.65)' }}>発</span>
            </div>
            <div style={{ fontSize: 13.5, fontWeight: 600, color: 'rgba(255,255,255,.9)', marginTop: 14 }}>{line}</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,.6)', marginTop: 5 }}>{sub}</div>
          </div>
        </div>

        <div style={{ ...cardBase, padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {!isBus ? (
            <>
              <div>
                <div style={{ fontSize: 12, color: 'var(--ink-3)', fontWeight: 600, marginBottom: 8 }}>方面</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {dirBtns.map((d, i) => (
                    <button key={i} type="button" onClick={d.onClick} style={{ textAlign: 'left', fontSize: 12.5, fontWeight: 600, padding: '9px 12px', borderRadius: 10, border: `1px solid ${d.active ? 'var(--ink)' : 'var(--line-2)'}`, background: d.active ? 'var(--ink)' : 'var(--surface)', color: d.active ? 'var(--surface)' : 'var(--ink-2)' }}>{d.label}</button>
                  ))}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 13, borderTop: '1px solid var(--line)' }}><span style={{ fontSize: 12.5, color: 'var(--ink-3)' }}>路線</span><span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink)' }}>{lineName}</span></div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}><span style={{ fontSize: 12.5, color: 'var(--ink-3)' }}>備考</span><span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink)' }}>{remark}</span></div>
            </>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 0', borderBottom: '1px solid var(--line)' }}><span style={{ fontSize: 12.5, color: 'var(--ink-3)' }}>運行日</span><span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink)' }}>平日のみ（土日祝運休）</span></div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 9, borderBottom: '1px solid var(--line)' }}><span style={{ fontSize: 12.5, color: 'var(--ink-3)' }}>運賃</span><span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink)' }}>無料（学生証提示）</span></div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}><span style={{ fontSize: 12.5, color: 'var(--ink-3)' }}>所要時間</span><span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink)', fontFamily: 'var(--font-mono)' }}>{ride}</span></div>
            </>
          )}
        </div>
      </div>

      {/* 時刻表 */}
      <div style={{ ...cardBase, padding: '16px 20px 8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 8 }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>時刻表 · {tableLabel}</div>
          <div style={{ display: 'flex', gap: 3, background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 999, padding: 3 }}>
            <button type="button" onClick={() => setDia('wd')} style={{ fontSize: 11.5, fontWeight: 700, padding: '5px 14px', borderRadius: 999, border: 'none', ...segStyle(!isWE) }}>平日</button>
            <button type="button" onClick={() => setDia('we')} style={{ fontSize: 11.5, fontWeight: 700, padding: '5px 14px', borderRadius: 999, border: 'none', ...segStyle(isWE) }}>土日祝</button>
          </div>
        </div>

        {thours.map((h) => (
          <div key={h} style={{ display: 'flex', alignItems: 'flex-start', gap: 14, padding: '9px 0', borderTop: '1px solid var(--line)' }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 15, fontWeight: 700, color: 'var(--ink)', width: 30, flex: 'none', paddingTop: 4 }}>{String(h).padStart(2, '0')}</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, flex: 1 }}>
              {activeTable[h]
                .map(normE)
                .sort((a, b) => a.mm - b.mm)
                .map((en, i) => {
                  const t = h * 60 + en.mm;
                  const isNext = t === next;
                  const past = t < now;
                  const tyE = en.ty || (isBus ? null : defType);
                  const dirTh = tyE === 'mus' || tyE === 'toz';
                  const dsE = isBus ? null : en.ds || defDest;
                  return (
                    <span key={i} style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2, minWidth: 36, padding: '4px 7px', borderRadius: 8, background: isNext ? 'var(--ink)' : past ? 'var(--surface-2)' : 'var(--surface)', border: `1px solid ${isNext ? 'var(--ink)' : past ? 'transparent' : 'var(--line-2)'}` }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                        {tyE && (
                          <span style={{ fontSize: 8, fontWeight: 800, letterSpacing: '.02em', padding: '2px 3.5px', borderRadius: 3.5, lineHeight: 1, background: isNext ? (dirTh ? '#fff' : 'rgba(255,255,255,.25)') : dirTh ? (past ? 'var(--ink-3)' : 'var(--ink)') : 'var(--surface-2)', color: isNext ? (dirTh ? '#15171A' : '#fff') : dirTh ? 'var(--surface)' : past ? 'var(--ink-3)' : 'var(--ink-2)' }}>{TYPCH[tyE]}</span>
                        )}
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600, color: isNext ? 'var(--surface)' : past ? 'var(--ink-3)' : 'var(--ink)' }}>{String(en.mm).padStart(2, '0')}</span>
                      </span>
                      {dsE && <span style={{ fontSize: 8.5, fontWeight: 600, lineHeight: 1, color: isNext ? 'rgba(255,255,255,.8)' : past ? 'var(--ink-3)' : 'var(--ink-2)' }}>{dsE}</span>}
                    </span>
                  );
                })}
            </div>
          </div>
        ))}

        {empty && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '20px 0', borderTop: '1px solid var(--line)', color: 'var(--ink-3)', fontSize: 13 }}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 8v4.5M12 15.5h.01" /></svg>
            土日祝はスクールバス運休です。電車をご利用ください。
          </div>
        )}

        {/* 凡例 */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, padding: '12px 0', marginTop: 2, borderTop: '1px solid var(--line)', fontSize: 11, color: 'var(--ink-3)' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={{ width: 22, height: 16, borderRadius: 5, background: 'var(--ink)' }} />次の発車</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={{ width: 22, height: 16, borderRadius: 5, background: 'var(--surface)', border: '1px solid var(--line-2)' }} />発車前</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={{ width: 22, height: 16, borderRadius: 5, background: 'var(--surface-2)' }} />発車済み</span>
          {!isBus &&
            legendItems.map((lg, i) => (
              <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 9, fontWeight: 800, padding: '2.5px 5px', borderRadius: 4, lineHeight: 1, background: lg.solid ? 'var(--ink)' : 'var(--surface-2)', color: lg.solid ? 'var(--surface)' : 'var(--ink-2)', border: `1px solid ${lg.solid ? 'var(--ink)' : 'var(--line-2)'}` }}>{lg.b}</span>
                {lg.txt}
              </span>
            ))}
          {!isBus && <span>{legendNote}</span>}
        </div>
      </div>
    </div>
  );
}
