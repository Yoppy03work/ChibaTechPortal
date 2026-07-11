'use client';

/**
 * キャンパス画面（設計 isCampus）— モノクロのアイソメトリック学内マップ。
 *
 * WHY: 設計の mapSvg（2D/3D 投影・建物・門・現在地ピン）を React に移植。キャンパス選択・
 * 2D/3D 切替・建物選択の状態を持つためクライアント。テーマで配色を切替。PC幅では本文と
 * 右カラム（学年歴・スクールバス）を 2 カラムにする（ctp-campus-grid）。
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTheme } from '@/components/theme-provider';

type Part = { x: number; y: number; w: number; d: number; fl: number };
type Item = { id: string; label: string; name: string; x: number; y: number; w: number; d: number; fl: number; fac: string[]; kind: string; courts?: number; dir?: number; parts?: Part[] };
type Campus = { name: string; sub: string; nextId: string | null; lot: [number, number]; loc: { x: number; y: number }; gates: { label: string; x: number; y: number }[]; greens: { x: number; y: number; w: number; d: number }[]; items: Item[]; rot0?: number; hScale?: number };

const B = (id: string, label: string, name: string, x: number, y: number, w: number, d: number, fl: number, fac?: string[], kind?: string, extra?: { courts?: number; dir?: number; parts?: Part[] }): Item => ({ id, label, name, x, y, w, d, fl: fl == null ? 1 : fl, fac: fac || [], kind: kind || 'bldg', ...extra });

// 配置は公式キャンパスマップ準拠（真上表示：上=北, 下=南, 左=西, 右=東）。
// fl=階数（3Dの高さ）。1・2号館はツインタワーなので高層、フィールドは fl:0。
const CAMPUS: Record<string, Campus> = {
  tsudanuma: {
    // 公式マップ（津田沼キャンパス）準拠。上=北。1・2号館は19階の高層で南北に並ぶ。
    // rot0=2 で初期は逆側（南東）から。視点ボタンでさらに回転できる。
    name: '津田沼キャンパス', sub: 'JR津田沼駅 徒歩1分', nextId: '2', lot: [11, 12], loc: { x: 0.9, y: 2.6 }, rot0: 2,
    gates: [{ label: '正門', x: 0.5, y: 2.6 }, { label: '通用門', x: 5.2, y: 0.1 }, { label: '車両門', x: 10.3, y: 2.2 }, { label: '南門', x: 1.0, y: 9.7 }],
    greens: [{ x: 4.6, y: 4.5, w: 1.2, d: 1.6 }],
    items: [
      B('5', '5', '5号館', 2.4, 0.6, 1.6, 1.4, 7, ['図書館']),
      B('1', '1', '1号館', 2.6, 2.3, 2.8, 2.0, 20, ['学生・教務担当・保健室(1F)', '就職担当(2F)・研究室']),
      B('7', '7', '7号館', 7.2, 2.4, 2.6, 2.3, 9, ['演習室・講義室', '研究室・実験室']),
      B('6', '6', '6号館', 2.0, 4.7, 2.2, 1.8, 5, ['講義室']),
      B('3', '3', '3号館', 6.2, 4.8, 2.4, 1.4, 2, ['食堂(1F)', '購買・ラウンジ(2F)']),
      B('Ar', '建', '建築実験室', 9.9, 4.3, 1.0, 0.9, 1, ['実験室']),
      B('C', '土', '土木実験・研究室', 9.9, 5.5, 0.9, 0.9, 1, ['実験室・研究室']),
      B('2', '2', '2号館', 2.4, 6.7, 2.8, 1.6, 20, ['研究室 2401', '実験室']),
      B('4', '4', '4号館', 5.6, 6.7, 2.8, 1.5, 9, ['工作センター(B1F)・部室', '研究室・階段教室']),
      B('8', '8', '8号館', 1.4, 9.0, 1.6, 1.3, 8, ['研究所・実験室・研究室']),
      B('9', '9', '9号館', 3.5, 9.4, 2.4, 0.8, 3, ['実験室']),
      B('8b', '別', '8号館別館', 1.6, 10.6, 1.2, 0.9, 1, ['実験室']),
    ],
  },
  shinnarashino: {
    // 公式キャンパスマップ（campus_map.pdf）準拠。上=北。正門=北西、野球場=東。
    // 4号館=体育館、6号館=図書館、2号館=研究棟、13号館=購買棟(北)/食堂棟(南)の2棟。
    // fl は見た目用の近似（公式の階数表記は最上階ではないため根拠にしない）。
    name: '新習志野キャンパス', sub: 'JR新習志野駅 徒歩8分', nextId: null, lot: [15, 10], loc: { x: 1.0, y: 1.9 }, hScale: 1.5,
    gates: [{ label: '正門', x: 0.6, y: 1.5 }],
    greens: [{ x: 1.6, y: 4.4, w: 1.4, d: 1.2 }],
    items: [
      B('11', '11', '11号館', 3.4, 0.4, 2.4, 1.3, 3, ['演習室・工作室']),
      B('12', '12', '12号館', 0.5, 2.6, 1.3, 1.3, 8, ['教学センター・保健室', 'ジム・フリークライミング(7F)']),
      B('1', '1', '1号館（千葉工大会館）', 2.2, 2.7, 1.4, 1.0, 2, ['大講義室']),
      B('2', '2', '2号館（研究棟）', 3.7, 3.7, 1.0, 0.8, 9, ['教育センター事務室', '教員研究室']),
      B('3', '3', '3号館（実験棟）', 3.7, 2.5, 1.7, 1.0, 3, ['物理・化学実験室', '製図室']),
      B('6', '6', '6号館（図書館）', 5.7, 2.6, 1.5, 1.2, 2, ['図書館']),
      B('4', '4', '4号館（体育館）', 7.5, 2.5, 1.2, 1.6, 2, ['アリーナ', 'トレーニングルーム']),
      B('R1', '桑', '桑蓬寮', 9.8, 2.6, 1.5, 1.0, 4, ['学生寮（男子）']),
      B('R2', '椿', '椿寮', 11.9, 2.8, 1.3, 1.0, 4, ['学生寮（女子）']),
      B('5', '5', '5号館（講義棟）', 3.3, 4.6, 3.0, 1.5, 3, ['講義室・掲示板']),
      B('9', '9', '9号館', 6.8, 4.3, 0.7, 1.9, 3, ['講義室']),
      B('13a', '購', '13号館（購買棟）', 0.4, 4.6, 1.0, 1.3, 2, ['書籍・文具']),
      B('13b', '食', '13号館（食堂棟）', 0.6, 7.0, 1.5, 1.3, 3, ['食堂', '多目的ホール(3F)']),
      B('8', '8', '8号館（講義棟）', 2.9, 7.4, 2.2, 1.3, 2, ['講義室・PC演習室']),
      B('7', '7', '7号館（講義棟）', 5.5, 7.4, 1.6, 1.3, 2, ['講義室・演習室']),
      B('10', '10', '10号館', 7.5, 7.6, 0.9, 1.1, 2, ['学生サポートセンター']),
      B('F', 'フ', 'フットサルコート', 8.1, 4.6, 1.6, 1.1, 0, ['フットサル'], 'court', { courts: 2 }),
      B('C', 'テ', 'テニスコート', 8.1, 6.0, 1.4, 1.8, 0, ['テニス'], 'court', { courts: 6 }),
      B('Y', '野', '野球場', 9.9, 4.4, 3.6, 3.5, 0, ['野球場'], 'baseball', { dir: 2 }),
    ],
  },
  ground: {
    // 公式キャンパスマップ（campus_map.pdf）準拠。縦長の敷地：上=北。
    // 陸上・ラグビー=北西、野球場=北東、コート群=西、サッカー場=南東、正門=東、西門=南西。
    name: '茜浜運動施設', sub: '新習志野キャンパス 隣接 · 運動施設', nextId: null, lot: [10, 14], loc: { x: 9.0, y: 6.9 }, hScale: 2,
    gates: [{ label: '正門', x: 9.6, y: 6.7 }, { label: '西門', x: 4.5, y: 12.7 }], greens: [],
    items: [
      B('T', '陸', '陸上競技場（ラグビー場）', 0.8, 0.5, 3.6, 4.5, 0, ['400mトラック', 'ラグビー場'], 'track'),
      B('Y', '野', '野球場', 5.2, 0.9, 4.1, 3.6, 0, ['野球場'], 'baseball', { dir: 3 }),
      B('HB', 'ハ', 'ハンドボールコート', 2.6, 4.9, 1.5, 1.0, 0, ['ハンドボール'], 'court', { courts: 1 }),
      B('BV', 'ビ', 'ビーチバレーコート', 2.0, 6.1, 1.5, 0.9, 0, ['ビーチバレー'], 'court', { courts: 2 }),
      B('C', 'テ', 'テニスコート', 1.4, 7.2, 1.7, 2.2, 0, ['テニス'], 'court', { courts: 6 }),
      B('In', '屋', '屋内練習場', 5.6, 5.0, 2.1, 1.3, 1, ['屋内練習場']),
      B('Cl', '部', '部室棟', 5.6, 6.5, 1.1, 0.7, 1, ['部室']),
      B('Kn', '管', '管理室', 7.0, 6.5, 0.9, 0.7, 1, ['管理室']),
      B('Bk', '武', '武道館', 5.8, 7.6, 1.5, 1.3, 2, ['武道館']),
      B('Bj', '道', '武道場', 4.7, 8.0, 0.9, 0.9, 1, ['武道場']),
      B('Hg', '格', '格納庫', 4.0, 9.7, 0.9, 0.8, 1, ['格納庫']),
      B('Ms', '機', '機械工学科実習室', 3.8, 10.7, 0.9, 0.8, 1, ['実習室']),
      B('MH', '多', '多目的ホール', 4.9, 11.2, 1.1, 1.0, 1, ['多目的ホール']),
      B('S', 'サ', 'サッカー場', 6.3, 9.0, 3.0, 3.6, 0, ['サッカー場'], 'field'),
    ],
  },
};

const CHIPS: [string, string][] = [['tsudanuma', '津田沼'], ['shinnarashino', '新習志野'], ['ground', '茜浜']];

function palette(dark: boolean) {
  return dark
    ? { ground: '#15171c', grid: '#262932', roof: '#2C2F37', east: '#22252c', south: '#191c22', stroke: '#3c414b', txt: '#E6E8EC', sub: '#9aa0ab', green: '#1d2127', selRoof: '#F1F2F0', selEast: '#c7cad0', selSouth: '#abafb6', selTxt: '#15171A', accent: '#F1F2F0', pin: '#F1F2F0', pinRing: '#15171A' }
    : { ground: '#EAEDF2', grid: '#D7DCE4', roof: '#FFFFFF', east: '#DBE0E8', south: '#C5CBD5', stroke: '#A7AFBB', txt: '#3A4150', sub: '#8A92A0', green: '#DEE3EA', selRoof: '#15171A', selEast: '#33363c', selSouth: '#202228', selTxt: '#FFFFFF', accent: '#15171A', pin: '#15171A', pinRing: '#FFFFFF' };
}

export function CampusScreen() {
  const { theme } = useTheme();
  const dark = theme === 'dark';
  const [campusSel, setCampusSel] = useState('tsudanuma');
  const [mapMode, setMapMode] = useState<'2d' | '3d'>('3d');
  const [sel, setSel] = useState<string | null>(null);

  const cur = CAMPUS[campusSel] || CAMPUS.tsudanuma;
  const baseRot = (cur.rot0 || 0) * (Math.PI / 2);
  const [rot, setRot] = useState(baseRot);
  const [zoom, setZoom] = useState(1);

  const selItem = cur.items.find((it) => it.id === sel) || null;
  const nextItem = cur.items.find((it) => it.id === cur.nextId) || null;
  const nextLabel = nextItem ? nextItem.name + (nextItem.id === '2' ? ' 2401' : '') : '';

  const mapRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ x: number; startRot: number; moved: number } | null>(null);
  const didDragRef = useRef(false);

  // ホイールでズーム（非パッシブでページスクロールを止める）
  useEffect(() => {
    const el = mapRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => { e.preventDefault(); setZoom((z) => Math.min(4, Math.max(0.55, z * (1 - e.deltaY * 0.0015)))); };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const resetView = () => { setRot(baseRot); setZoom(1); };
  const switchCampus = (k: string) => { setCampusSel(k); setSel(null); setZoom(1); setRot((CAMPUS[k]?.rot0 || 0) * (Math.PI / 2)); };
  const onPointerDown = (e: React.PointerEvent) => { (e.currentTarget as Element).setPointerCapture?.(e.pointerId); dragRef.current = { x: e.clientX, startRot: rot, moved: 0 }; didDragRef.current = false; };
  const onPointerMove = (e: React.PointerEvent) => { const d = dragRef.current; if (!d) return; const dx = e.clientX - d.x; d.moved += Math.abs(dx); if (d.moved > 6) didDragRef.current = true; setRot(d.startRot - dx * 0.012); };
  const onPointerUp = () => { dragRef.current = null; };

  const svg = useMemo(() => {
    const iso = mapMode === '3d';
    // floorH=1階ぶんの高さ。キャンパスごとに hScale で補正（低層中心のキャンパスは高めに見せる）
    const a = 22, bb = 11, cZ = 8, U = 26, floorH = 0.75 * (cur.hScale || 1);
    const [W0, D0] = cur.lot;
    // rot ラジアンで平面を中心回りに回転してからアイソメ投影（任意角度に対応）
    const cgx = W0 / 2, cgy = D0 / 2, cosT = Math.cos(rot), sinT = Math.sin(rot);
    const prj = (x: number, y: number, z: number) => {
      const dx = x - cgx, dy = y - cgy;
      const rx = dx * cosT - dy * sinT, ry = dx * sinT + dy * cosT;
      return iso ? { X: (rx - ry) * a, Y: (rx + ry) * bb - (z || 0) * cZ } : { X: rx * U, Y: ry * U };
    };
    const C = palette(dark);
    const pts = (arr: { X: number; Y: number }[]) => arr.map((p) => `${p.X.toFixed(1)},${p.Y.toFixed(1)}`).join(' ');
    const all: { X: number; Y: number }[] = [];
    const add = (p: { X: number; Y: number }) => { all.push(p); return p; };
    const nodes: React.ReactNode[] = [];
    let key = 0;

    const g0 = add(prj(0, 0, 0)), g1 = add(prj(W0, 0, 0)), g2 = add(prj(W0, D0, 0)), g3 = add(prj(0, D0, 0));
    nodes.push(<polygon key="gp" points={pts([g0, g1, g2, g3])} fill={C.ground} />);

    const gl: React.ReactNode[] = [];
    for (let i = 0; i <= Math.ceil(W0); i++) { const p = prj(i, 0, 0), q = prj(i, D0, 0); gl.push(<line key={`gx${i}`} x1={p.X} y1={p.Y} x2={q.X} y2={q.Y} stroke={C.grid} strokeWidth={1} />); }
    for (let j = 0; j <= Math.ceil(D0); j++) { const p = prj(0, j, 0), q = prj(W0, j, 0); gl.push(<line key={`gy${j}`} x1={p.X} y1={p.Y} x2={q.X} y2={q.Y} stroke={C.grid} strokeWidth={1} />); }
    nodes.push(<g key="grid" opacity={0.6}>{gl}</g>);

    cur.greens.forEach((gr, i) => { const q0 = add(prj(gr.x, gr.y, 0)), q1 = add(prj(gr.x + gr.w, gr.y, 0)), q2 = add(prj(gr.x + gr.w, gr.y + gr.d, 0)), q3 = add(prj(gr.x, gr.y + gr.d, 0)); nodes.push(<polygon key={`gr${i}`} points={pts([q0, q1, q2, q3])} fill={C.green} />); });

    // 建物：投影後の中心Yで奥→手前にソートして描画
    const order = cur.items.slice().map((it) => ({ it, cy: prj(it.x + it.w / 2, it.y + it.d / 2, 0).Y })).sort((p, q) => p.cy - q.cy).map((o) => o.it);
    order.forEach((it) => {
      const isSel = it.id === sel, isNext = it.id === cur.nextId, flat = it.fl <= 0;
      const x0 = it.x, y0 = it.y, x1 = it.x + it.w, y1 = it.y + it.d;
      const cs: [number, number][] = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
      const base = cs.map(([px, py]) => add(prj(px, py, 0)));
      const grp: React.ReactNode[] = [];
      // ── フィールド類は公式マップに近い形状で描く（矩形スラブではなく） ──
      if (flat && it.kind === 'track') {
        // 陸上競技場：スタジアム形（両端半円）のトラック + 内側にレーン線とラグビー場
        const stadium = (inset: number) => {
          const X0 = x0 + inset, Y0 = y0 + inset, X1 = x1 - inset, Y1 = y1 - inset;
          const ww = X1 - X0, dd = Y1 - Y0;
          const out: { X: number; Y: number }[] = [];
          const step = 15;
          if (dd >= ww) {
            const r = ww / 2, cx2 = X0 + r, cyT = Y0 + r, cyB = Y1 - r;
            for (let ang = 180; ang <= 360; ang += step) { const t = (ang * Math.PI) / 180; out.push(add(prj(cx2 + r * Math.cos(t), cyT + r * Math.sin(t), 0))); }
            for (let ang = 0; ang <= 180; ang += step) { const t = (ang * Math.PI) / 180; out.push(add(prj(cx2 + r * Math.cos(t), cyB + r * Math.sin(t), 0))); }
          } else {
            const r = dd / 2, cy2 = Y0 + r, cxL = X0 + r, cxR = X1 - r;
            for (let ang = 90; ang <= 270; ang += step) { const t = (ang * Math.PI) / 180; out.push(add(prj(cxL + r * Math.cos(t), cy2 + r * Math.sin(t), 0))); }
            for (let ang = -90; ang <= 90; ang += step) { const t = (ang * Math.PI) / 180; out.push(add(prj(cxR + r * Math.cos(t), cy2 + r * Math.sin(t), 0))); }
          }
          return out;
        };
        grp.push(<polygon key="hit" points={pts(base)} fill="transparent" stroke="none" />);
        grp.push(<polygon key="tr0" points={pts(stadium(0))} fill={isSel ? C.selRoof : C.ground} stroke={isSel ? C.selSouth : C.stroke} strokeWidth={1.1} strokeLinejoin="round" />);
        grp.push(<polygon key="tr1" points={pts(stadium(Math.min(x1 - x0, y1 - y0) * 0.07))} fill="none" stroke={isSel ? C.selSouth : C.stroke} strokeWidth={0.8} strokeDasharray="3 3" />);
        const wIn = (x1 - x0) * 0.2, dIn = (y1 - y0) * 0.26;
        grp.push(<polygon key="rg" points={pts([add(prj(x0 + wIn, y0 + dIn, 0)), add(prj(x1 - wIn, y0 + dIn, 0)), add(prj(x1 - wIn, y1 - dIn, 0)), add(prj(x0 + wIn, y1 - dIn, 0))])} fill={isSel ? C.selEast : C.green} stroke={isSel ? C.selSouth : C.stroke} strokeWidth={0.9} />);
      } else if (flat && it.kind === 'baseball') {
        // 野球場：扇形（ホーム角 + 両翼のファウルライン + 外野の弧）+ 内野ダイヤモンド
        const dir = it.dir ?? 3;
        const corners: [number, number][] = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
        const Hc = corners[dir], Ac = corners[(dir + 3) % 4], Bc2 = corners[(dir + 1) % 4];
        const fan: { X: number; Y: number }[] = [add(prj(Hc[0], Hc[1], 0))];
        for (let ang = 0; ang <= 90; ang += 9) {
          const t = (ang * Math.PI) / 180;
          fan.push(add(prj(Hc[0] + Math.cos(t) * (Ac[0] - Hc[0]) + Math.sin(t) * (Bc2[0] - Hc[0]), Hc[1] + Math.cos(t) * (Ac[1] - Hc[1]) + Math.sin(t) * (Bc2[1] - Hc[1]), 0)));
        }
        grp.push(<polygon key="hit" points={pts(base)} fill="transparent" stroke="none" />);
        grp.push(<polygon key="bb" points={pts(fan)} fill={isSel ? C.selRoof : C.green} stroke={isSel ? C.selSouth : C.stroke} strokeWidth={1.1} strokeLinejoin="round" />);
        const f = 0.2, v0: [number, number] = [Hc[0] + (Ac[0] - Hc[0]) * 0.05 + (Bc2[0] - Hc[0]) * 0.05, Hc[1] + (Ac[1] - Hc[1]) * 0.05 + (Bc2[1] - Hc[1]) * 0.05];
        const e1 = [(Ac[0] - Hc[0]) * f, (Ac[1] - Hc[1]) * f], e2 = [(Bc2[0] - Hc[0]) * f, (Bc2[1] - Hc[1]) * f];
        grp.push(<polygon key="dm" points={pts([add(prj(v0[0], v0[1], 0)), add(prj(v0[0] + e1[0], v0[1] + e1[1], 0)), add(prj(v0[0] + e1[0] + e2[0], v0[1] + e1[1] + e2[1], 0)), add(prj(v0[0] + e2[0], v0[1] + e2[1], 0))])} fill={isSel ? C.selEast : C.ground} stroke={isSel ? C.selSouth : C.stroke} strokeWidth={0.9} />);
      } else if (flat && it.kind === 'court') {
        // コート類：面数(courts)ぶんのコート枠を並べ、各コートにネットの中央線
        const n = it.courts || 1;
        const bw = x1 - x0, bd = y1 - y0;
        const cols = Math.max(1, Math.round(Math.sqrt(n * (bw / bd)))), rows = Math.ceil(n / cols);
        const gap = Math.min(bw, bd) * 0.09;
        const cw = (bw - gap * (cols + 1)) / cols, cd = (bd - gap * (rows + 1)) / rows;
        grp.push(<polygon key="hit" points={pts(base)} fill="transparent" stroke="none" />);
        for (let ci = 0; ci < n; ci++) {
          const col = ci % cols, row = Math.floor(ci / cols);
          const cx0 = x0 + gap + col * (cw + gap), cy0 = y0 + gap + row * (cd + gap);
          grp.push(<polygon key={`c${ci}`} points={pts([add(prj(cx0, cy0, 0)), add(prj(cx0 + cw, cy0, 0)), add(prj(cx0 + cw, cy0 + cd, 0)), add(prj(cx0, cy0 + cd, 0))])} fill={isSel ? C.selRoof : C.roof} stroke={isSel ? C.selSouth : C.stroke} strokeWidth={0.9} />);
          const net = cw >= cd
            ? [prj(cx0 + cw / 2, cy0, 0), prj(cx0 + cw / 2, cy0 + cd, 0)]
            : [prj(cx0, cy0 + cd / 2, 0), prj(cx0 + cw, cy0 + cd / 2, 0)];
          grp.push(<line key={`n${ci}`} x1={net[0].X} y1={net[0].Y} x2={net[1].X} y2={net[1].Y} stroke={isSel ? C.selSouth : C.stroke} strokeWidth={0.8} />);
        }
      } else if (flat) {
        // その他の平面フィールド
        grp.push(<polygon key="r" points={pts(base)} fill={isSel ? C.selRoof : C.green} stroke={isNext && !isSel ? C.accent : C.stroke} strokeWidth={isNext && !isSel ? 2 : 0.9} strokeLinejoin="round" />);
      } else {
        // ── 建物：外観を反映した複数パーツ（低層ポディウム + 高層タワー等）の角柱で描く ──
        const partsL: Part[] = it.parts && it.parts.length ? it.parts : [{ x: it.x, y: it.y, w: it.w, d: it.d, fl: it.fl }];
        grp.push(<polygon key="hit" points={pts(base)} fill="transparent" stroke="none" />);
        const sortedParts = partsL.map((p) => ({ p, cy: prj(p.x + p.w / 2, p.y + p.d / 2, 0).Y })).sort((a, b) => a.cy - b.cy).map((o) => o.p);
        sortedParts.forEach((p, pi) => {
          const ph = Math.max(0.8, p.fl) * floorH;
          const pcs: [number, number][] = [[p.x, p.y], [p.x + p.w, p.y], [p.x + p.w, p.y + p.d], [p.x, p.y + p.d]];
          const pb = pcs.map(([px, py]) => add(prj(px, py, 0)));
          const pt2 = pcs.map(([px, py]) => add(prj(px, py, ph)));
          if (iso) {
            // 手前の底角に接する2つの側面を可視面として描く（任意回転で正しい）
            let fi = 0; for (let i = 1; i < 4; i++) if (pb[i].Y > pb[fi].Y) fi = i;
            const e1: [number, number] = [(fi + 3) % 4, fi];
            const e2: [number, number] = [fi, (fi + 1) % 4];
            const face = ([i, j]: [number, number]) => [pb[i], pb[j], pt2[j], pt2[i]];
            const ax = ([i, j]: [number, number]) => (pb[i].X + pb[j].X) / 2;
            const darker = ax(e1) < ax(e2) ? e1 : e2;
            const lighter = darker === e1 ? e2 : e1;
            grp.push(<polygon key={`s${pi}`} points={pts(face(darker))} fill={isSel ? C.selSouth : C.south} stroke={isSel ? C.selRoof : C.stroke} strokeWidth={0.75} strokeLinejoin="round" />);
            grp.push(<polygon key={`e${pi}`} points={pts(face(lighter))} fill={isSel ? C.selEast : C.east} stroke={isSel ? C.selRoof : C.stroke} strokeWidth={0.75} strokeLinejoin="round" />);
          }
          grp.push(<polygon key={`r${pi}`} points={pts(pt2)} fill={isSel ? C.selRoof : C.roof} stroke={isNext && !isSel ? C.accent : C.stroke} strokeWidth={isNext && !isSel ? 1.8 : 0.9} strokeLinejoin="round" />);
        });
      }
      const hTop = flat ? 0 : Math.max(...(it.parts?.length ? it.parts.map((p) => p.fl) : [it.fl])) * floorH;
      const ctr = prj(x0 + it.w / 2, y0 + it.d / 2, hTop);
      grp.push(<text key="t" x={ctr.X} y={ctr.Y + 4} textAnchor="middle" fill={isSel ? C.selTxt : flat ? C.sub : C.txt} fontSize={flat ? 11 : 12} fontWeight={700} fontFamily="'JetBrains Mono', monospace" style={{ pointerEvents: 'none' }}>{it.label}</text>);
      if (isNext && !isSel) grp.push(<circle key="nx" cx={ctr.X} cy={ctr.Y - 15} r={3.5} fill={C.accent} />);
      nodes.push(<g key={`b${key++}`} onClick={() => { if (didDragRef.current) return; setSel((s) => (s === it.id ? null : it.id)); }} style={{ cursor: 'pointer' }}>{grp}</g>);
    });

    cur.gates.forEach((gt, i) => { const p = add(prj(gt.x, gt.y, 0)); nodes.push(<g key={`gate${i}`}><circle cx={p.X} cy={p.Y} r={2.5} fill="none" stroke={C.sub} strokeWidth={1.4} /><text x={p.X} y={p.Y + 14} textAnchor="middle" fill={C.sub} fontSize={9.5} fontWeight={600} fontFamily="'Zen Kaku Gothic New', sans-serif">{gt.label}</text></g>); });

    const lp = add(prj(cur.loc.x, cur.loc.y, 0)); add({ X: lp.X, Y: lp.Y - 24 });
    nodes.push(<g key="pin"><path d={`M${lp.X} ${lp.Y - 20} c -7 0 -11 5 -11 11 c 0 7 11 16 11 16 c 0 0 11 -9 11 -16 c 0 -6 -4 -11 -11 -11 z`} fill={C.pin} stroke={C.pinRing} strokeWidth={1.6} /><circle cx={lp.X} cy={lp.Y - 9} r={3.6} fill={C.pinRing} /></g>);

    let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
    all.forEach((p) => { if (p.X < minX) minX = p.X; if (p.X > maxX) maxX = p.X; if (p.Y < minY) minY = p.Y; if (p.Y > maxY) maxY = p.Y; });
    const pad = 28;
    const bw = maxX - minX + pad * 2, bh = maxY - minY + pad * 2;
    const ccx = minX - pad + bw / 2, ccy = minY - pad + bh / 2;
    const zw = bw / zoom, zh = bh / zoom;
    const vb = `${ccx - zw / 2} ${ccy - zh / 2} ${zw} ${zh}`;
    return <svg viewBox={vb} width="100%" height="100%" preserveAspectRatio="xMidYMid meet" style={{ display: 'block' }}>{nodes}</svg>;
  }, [campusSel, mapMode, sel, dark, cur, rot, zoom]);

  const seg = (active: boolean): React.CSSProperties => ({ fontSize: 12, fontWeight: 700, padding: '6px 15px', borderRadius: 999, border: 'none', background: active ? 'var(--surface)' : 'transparent', color: active ? 'var(--ink)' : 'var(--ink-3)' });
  const card: React.CSSProperties = { overflow: 'hidden', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 18, padding: '18px 20px', boxShadow: 'var(--shadow-card)' };

  return (
    <div className="ctp-screen ctp-campus-grid">
      {/* マップカード */}
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700 }}>学内マップ</div>
            <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 1 }}>{cur.sub}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 'none' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 2, background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 999, padding: 3 }}>
              <button type="button" onClick={() => setZoom((z) => Math.max(0.55, z / 1.25))} aria-label="縮小" style={{ width: 26, height: 26, borderRadius: 999, border: 'none', background: 'transparent', color: 'var(--ink-2)', fontSize: 17, fontWeight: 700, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>−</button>
              <button type="button" onClick={resetView} aria-label="視点をリセット" title="視点をリセット" style={{ width: 26, height: 26, borderRadius: 999, border: 'none', background: 'transparent', color: 'var(--ink-2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 2.5-6.2" /><path d="M3 4v4h4" /></svg>
              </button>
              <button type="button" onClick={() => setZoom((z) => Math.min(4, z * 1.25))} aria-label="拡大" style={{ width: 26, height: 26, borderRadius: 999, border: 'none', background: 'transparent', color: 'var(--ink-2)', fontSize: 16, fontWeight: 700, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>＋</button>
            </div>
            <div style={{ display: 'flex', gap: 4, background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 999, padding: 3 }}>
              <button type="button" onClick={() => setMapMode('2d')} style={seg(mapMode === '2d')}>2D</button>
              <button type="button" onClick={() => setMapMode('3d')} style={seg(mapMode === '3d')}>3D</button>
            </div>
          </div>
        </div>

        <div className="ctp-chips" style={{ display: 'flex', gap: 8, marginTop: 14, overflowX: 'auto' }}>
          {CHIPS.map(([k, label]) => {
            const active = campusSel === k;
            return <button key={k} type="button" onClick={() => switchCampus(k)} style={{ flex: 'none', fontSize: 12.5, fontWeight: 600, padding: '7px 14px', borderRadius: 999, background: active ? 'var(--ink)' : 'var(--surface)', color: active ? 'var(--surface)' : 'var(--ink-2)', border: `1px solid ${active ? 'var(--ink)' : 'var(--line)'}` }}>{label}</button>;
          })}
        </div>

        <div ref={mapRef} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerLeave={onPointerUp} style={{ marginTop: 12, position: 'relative', height: 360, borderRadius: 14, background: 'var(--surface-2)', border: '1px solid var(--line)', overflow: 'hidden', touchAction: 'none', cursor: 'grab' }}>
          {svg}
          {selItem && (
            <div style={{ position: 'absolute', left: 14, right: 14, bottom: 14, display: 'flex', alignItems: 'center', gap: 12, background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 14, padding: '11px 13px', boxShadow: 'var(--shadow-card)' }}>
              <div style={{ width: 42, height: 42, borderRadius: 11, background: 'var(--ink)', color: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 15, flex: 'none' }}>{selItem.label}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700 }}>{selItem.name}</div>
                {/* WHY: fl は3D表示用の近似高さ（公式の階数表記は最上階ではない）ため「◯階建て」は表示しない */}
                <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{selItem.fac.join(' / ')}</div>
              </div>
              <button type="button" onClick={() => setSel(null)} aria-label="閉じる" style={{ width: 30, height: 30, borderRadius: 999, border: '1px solid var(--line)', background: 'var(--surface)', color: 'var(--ink-2)', flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>✕</button>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px 18px', marginTop: 12, fontSize: 11.5, color: 'var(--ink-2)' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={{ width: 11, height: 14, borderRadius: '3px 3px 7px 7px', background: 'var(--ink)', border: '1.5px solid var(--surface)', boxShadow: '0 0 0 1px var(--ink)' }} />現在地</span>
          {cur.nextId && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: 999, background: 'var(--ink)' }} />次の授業 · {nextLabel}</span>}
          <span style={{ color: 'var(--ink-3)' }}>タップで詳細 · ドラッグで回転 · ホイールで拡大縮小</span>
        </div>
      </div>

      {/* 右カラム：学年歴 + スクールバス */}
      <div className="ctp-col">
        <div style={card}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>学年歴</div>
          <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 1, marginBottom: 8 }}>2026年度 前期</div>
          {[
            { d: '4/8', label: '前期授業開始', muted: true },
            { d: '6/2', label: '中間試験 週', sub: '6/2(火)〜6/6(土)' },
            { d: '6/27', label: '津田沼祭（学園祭）' },
            { d: '7/22', label: '前期末試験', sub: '7/22(月)〜7/26(金)', strong: true },
            { d: '8/6', label: '夏季休業 開始', muted: true },
          ].map((e, i) => (
            <div key={i} style={{ display: 'flex', gap: 12, padding: '9px 0', borderTop: '1px solid var(--line)' }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: e.strong ? 'var(--ink)' : 'var(--ink-3)', width: 46, flex: 'none', fontWeight: e.strong ? 700 : 400 }}>{e.d}</span>
              <span style={{ width: 9, height: 9, borderRadius: 999, background: e.muted ? 'var(--line-2)' : e.strong ? 'var(--ink)' : 'var(--ink-3)', marginTop: 3, flex: 'none' }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: e.strong ? 700 : 600, color: e.muted ? 'var(--ink-3)' : 'var(--ink)' }}>{e.label}</div>
                {e.sub && <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>{e.sub}</div>}
              </div>
            </div>
          ))}
        </div>

        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div><div style={{ fontSize: 15, fontWeight: 700 }}>スクールバス</div><div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 1 }}>津田沼キャンパスゆき · 平日</div></div>
          </div>
          {[
            { t: '10:30', badge: 'あと8分' },
            { t: '11:00', note: '次の便' },
            { t: '11:30' },
            { t: '12:00' },
          ].map((r, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderTop: '1px solid var(--line)', marginTop: i === 0 ? 10 : 0 }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 17, fontWeight: 700, width: 62, color: i === 0 ? 'var(--ink)' : 'var(--ink-2)' }}>{r.t}</span>
              {r.badge && <span style={{ fontSize: 10.5, fontWeight: 700, padding: '3px 9px', borderRadius: 999, background: 'var(--ink)', color: 'var(--surface)' }}>{r.badge}</span>}
              {r.note && <span style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>{r.note}</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
