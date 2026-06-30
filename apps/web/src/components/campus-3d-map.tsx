'use client';

/**
 * 千葉工大 3Dキャンパスマップ。
 *
 * WHY: three.js を npm バンドル(同一オリジン)で読み込み、ポータルの厳格な CSP
 * (script-src 'self' 'strict-dynamic') 下でも動作する。校舎配置は公式キャンパスマップ
 * を基にした近似(津田沼は精密、新習志野/茜浜は近似)。後で Blender 製 glTF に差し替え可。
 * HUD は React 状態、3D は useEffect 内で構築し unmount/HMR・キャンパス切替で確実に破棄する。
 */
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

type Item = {
  name: string;
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
  color: number;
  info?: string;
  kind?: 'building' | 'field';
};

// 公式キャンパスマップ(2026)に基づく近似配置。x=東西, z=南北(駅は南=+z), h=高さ。
const CAMPUSES: Record<string, Item[]> = {
  津田沼: [
    { name: '7号館', x: -32, z: -8, w: 14, d: 11, h: 24, color: 0x9fb4d4, info: 'パナソニック・千葉工業大学 産学連携センター、コンピュータ演習室、研究室など。' },
    { name: '3号館', x: -16, z: 0, w: 11, d: 9, h: 8, color: 0xaec3e0, info: '学生食堂・購買など。' },
    { name: '4号館', x: -6, z: -12, w: 13, d: 10, h: 30, color: 0x88a7d6, info: '談話室・工作センター・部室。' },
    { name: '1号館', x: 10, z: -14, w: 14, d: 12, h: 52, color: 0x6f9bc9, info: '事務室・研究室など（高層ツインタワー）。' },
    { name: '2号館', x: 27, z: -12, w: 13, d: 11, h: 48, color: 0x6f9bc9, info: '大教室・研究室など（高層ツインタワー）。' },
    { name: '8号館', x: 43, z: -10, w: 11, d: 10, h: 26, color: 0x9fb4d4, info: '未来ロボット技術研究センター・惑星探査研究センターなど。' },
    { name: '9号館', x: 50, z: 0, w: 10, d: 9, h: 14, color: 0xaec3e0, info: '学生実験室。' },
    { name: '6号館', x: 8, z: 6, w: 11, d: 9, h: 14, color: 0xb7cae3, info: '講義棟。' },
    { name: '5号館', x: 0, z: 18, w: 11, d: 13, h: 22, color: 0x4f7ec0, info: '図書館など。' },
    { name: 'JR津田沼駅', x: 18, z: 44, w: 22, d: 12, h: 8, color: 0xb9e0ef, info: '最寄り駅（南口）。正門まで徒歩すぐ。' },
  ],
  新習志野: [
    { name: '学生寮', x: -46, z: -18, w: 10, d: 26, h: 22, color: 0xb9d0e6, info: '桑蓬寮・椿寮。' },
    { name: '体育館', x: -34, z: 2, w: 16, d: 14, h: 12, color: 0xc3d2ea, info: '体育館・プール。' },
    { name: '野球場', x: -10, z: -26, w: 24, d: 18, h: 0.3, color: 0x7fae5e, info: '野球場。', kind: 'field' },
    { name: 'テニスコート', x: 14, z: -28, w: 14, d: 10, h: 0.3, color: 0xc06a4a, info: 'テニスコート。', kind: 'field' },
    { name: '9号館', x: 2, z: -8, w: 12, d: 8, h: 12, color: 0xaec3e0 },
    { name: '10号館', x: 16, z: -10, w: 12, d: 8, h: 12, color: 0x9fb4d4 },
    { name: '7号館', x: 28, z: -6, w: 12, d: 9, h: 12, color: 0xb7cae3 },
    { name: '8号館', x: 38, z: 2, w: 16, d: 10, h: 14, color: 0x88a7d6, info: '講義棟・コンピュータ演習室。' },
    { name: '5号館', x: 44, z: 12, w: 12, d: 9, h: 12, color: 0xaec3e0, info: '講義棟。' },
    { name: '食堂棟', x: 40, z: 20, w: 12, d: 9, h: 8, color: 0xc3d2ea },
    { name: '2号館', x: 36, z: 28, w: 16, d: 9, h: 10, color: 0x9fb4d4 },
    { name: '6号館', x: -8, z: 8, w: 13, d: 10, h: 12, color: 0x4f7ec0, info: '図書館。' },
    { name: '11号館', x: -22, z: 22, w: 14, d: 9, h: 10, color: 0xb7cae3 },
    { name: '12号館', x: 12, z: 16, w: 10, d: 10, h: 30, color: 0x6f9bc9, info: '展望ラウンジ・アスレチックジム・学生自由工作室・事務室など（CITタワー）。' },
    { name: '1号館', x: 0, z: 26, w: 11, d: 8, h: 10, color: 0xaec3e0 },
    { name: '3号館', x: -16, z: 30, w: 12, d: 9, h: 10, color: 0x88a7d6, info: '物理・化学実験室など。' },
  ],
  茜浜: [
    { name: 'サッカー場', x: 6, z: -16, w: 22, d: 14, h: 0.3, color: 0x6fa64e, info: 'サッカー場。', kind: 'field' },
    { name: '野球場', x: -14, z: 14, w: 22, d: 16, h: 0.3, color: 0x7fae5e, info: '野球場。', kind: 'field' },
    { name: 'ラグビー・陸上競技場', x: 12, z: 18, w: 26, d: 14, h: 0.3, color: 0x5f9a44, info: 'ラグビー・陸上競技場。', kind: 'field' },
    { name: 'テニスコート', x: 30, z: 2, w: 12, d: 10, h: 0.3, color: 0xc06a4a, info: 'テニスコート。', kind: 'field' },
    { name: '武道館', x: -18, z: -10, w: 12, d: 9, h: 10, color: 0xc3d2ea },
    { name: '学生部室棟', x: -8, z: -4, w: 12, d: 8, h: 8, color: 0x9fb4d4 },
    { name: '武道場', x: 22, z: -8, w: 9, d: 8, h: 8, color: 0xaec3e0 },
    { name: '多目的ホール', x: 34, z: -10, w: 10, d: 8, h: 9, color: 0xb7cae3 },
    { name: '格納庫・音楽練習室', x: 30, z: -16, w: 9, d: 7, h: 7, color: 0xc3d2ea },
  ],
};
const CAMPUS_LIST = ['津田沼', '新習志野', '茜浜'] as const;

type Api = {
  focus: (i: number) => void;
  enterWalk: () => void;
  exitWalk: () => void;
  reset: () => void;
};

export default function Campus3DMap() {
  const mountRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<Api | null>(null);
  const [campus, setCampus] = useState<(typeof CAMPUS_LIST)[number]>('津田沼');
  const [selected, setSelected] = useState<Item | null>(null);
  const [mode, setMode] = useState<'orbit' | 'walk'>('orbit');

  const items = CAMPUSES[campus];

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const data = CAMPUSES[campus];
    const W = () => mount.clientWidth;
    const H = () => mount.clientHeight;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(W(), H());
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    mount.appendChild(renderer.domElement);

    const labelRenderer = new CSS2DRenderer();
    labelRenderer.setSize(W(), H());
    labelRenderer.domElement.style.cssText = 'position:absolute;top:0;left:0;pointer-events:none';
    mount.appendChild(labelRenderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xbfdcff);
    scene.fog = new THREE.Fog(0xbfdcff, 110, 280);

    const camera = new THREE.PerspectiveCamera(55, W() / H(), 0.1, 1000);
    camera.position.set(50, 52, 84);

    scene.add(new THREE.HemisphereLight(0xffffff, 0x6b7a90, 0.9));
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(60, 100, 40);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { near: 10, far: 320, left: -160, right: 160, top: 160, bottom: -160 });
    scene.add(sun);

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(500, 500),
      new THREE.MeshStandardMaterial({ color: 0x8fbf7f }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    const meshes: THREE.Mesh[] = [];
    for (const b of data) {
      const isField = b.kind === 'field';
      const mat = new THREE.MeshStandardMaterial({ color: b.color, roughness: isField ? 1 : 0.85 });
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(b.w, b.h, b.d), mat);
      mesh.position.set(b.x, b.h / 2 + 0.01, b.z);
      mesh.castShadow = !isField;
      mesh.receiveShadow = true;
      mesh.userData = b;
      scene.add(mesh);
      meshes.push(mesh);

      const el = document.createElement('div');
      el.className = isField ? 'c3d-label c3d-label-field' : 'c3d-label';
      el.textContent = b.name;
      const label = new CSS2DObject(el);
      label.position.set(0, b.h / 2 + (isField ? 1 : 3), 0);
      mesh.add(label);

      if (!isField) {
        const tree = new THREE.Mesh(
          new THREE.ConeGeometry(2, 6, 8),
          new THREE.MeshStandardMaterial({ color: 0x4f9d57 }),
        );
        tree.position.set(b.x + b.w / 2 + 4, 3, b.z);
        tree.castShadow = true;
        scene.add(tree);
      }
    }

    const orbit = new OrbitControls(camera, renderer.domElement);
    orbit.enableDamping = true;
    orbit.maxPolarAngle = Math.PI / 2 - 0.05;
    orbit.target.set(8, 6, 0);
    orbit.update();
    const homeCam = camera.position.clone();
    const homeTarget = orbit.target.clone();

    const walker = new PointerLockControls(camera, renderer.domElement);
    const move = { f: false, b: false, l: false, r: false };
    const velocity = new THREE.Vector3();
    let curMode: 'orbit' | 'walk' = 'orbit';

    let highlighted: THREE.Mesh | null = null;
    const setHighlight = (mesh: THREE.Mesh | null) => {
      if (highlighted) (highlighted.material as THREE.MeshStandardMaterial).emissive.setHex(0x000000);
      highlighted = mesh;
      if (mesh) {
        const m = mesh.material as THREE.MeshStandardMaterial;
        m.emissive = new THREE.Color(0x274b8a);
        m.emissiveIntensity = 0.5;
      }
    };

    walker.addEventListener('lock', () => {
      curMode = 'walk';
      setMode('walk');
    });
    walker.addEventListener('unlock', () => {
      curMode = 'orbit';
      orbit.enabled = true;
      setMode('orbit');
    });

    apiRef.current = {
      enterWalk() {
        curMode = 'walk';
        orbit.enabled = false;
        camera.position.set(0, 2.0, 50);
        camera.lookAt(0, 2, 0);
        walker.lock();
      },
      exitWalk() {
        walker.unlock();
      },
      reset() {
        if (curMode === 'walk') walker.unlock();
        camera.position.copy(homeCam);
        orbit.target.copy(homeTarget);
        orbit.update();
        setHighlight(null);
        setSelected(null);
      },
      focus(i) {
        const b = data[i];
        if (curMode === 'walk') walker.unlock();
        orbit.target.set(b.x, b.h / 2, b.z);
        camera.position.set(b.x + 26, b.h + 20, b.z + 26);
        orbit.update();
        setHighlight(meshes[i]);
        setSelected(b);
      },
    };

    const onKey = (down: boolean) => (e: KeyboardEvent) => {
      if (e.code === 'KeyW' || e.code === 'ArrowUp') move.f = down;
      if (e.code === 'KeyS' || e.code === 'ArrowDown') move.b = down;
      if (e.code === 'KeyA' || e.code === 'ArrowLeft') move.l = down;
      if (e.code === 'KeyD' || e.code === 'ArrowRight') move.r = down;
    };
    const onKeyDown = onKey(true);
    const onKeyUp = onKey(false);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    const ray = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const onClick = (e: MouseEvent) => {
      if (curMode !== 'orbit') return;
      const r = renderer.domElement.getBoundingClientRect();
      pointer.x = ((e.clientX - r.left) / r.width) * 2 - 1;
      pointer.y = -((e.clientY - r.top) / r.height) * 2 + 1;
      ray.setFromCamera(pointer, camera);
      const hit = ray.intersectObjects(meshes)[0];
      if (hit) {
        const mesh = hit.object as THREE.Mesh;
        setHighlight(mesh);
        setSelected(mesh.userData as Item);
      }
    };
    renderer.domElement.addEventListener('click', onClick);

    const clock = new THREE.Clock();
    let raf = 0;
    const animate = () => {
      raf = requestAnimationFrame(animate);
      const dt = Math.min(clock.getDelta(), 0.05);
      if (curMode === 'walk' && walker.isLocked) {
        const speed = 18;
        velocity.x -= velocity.x * 8 * dt;
        velocity.z -= velocity.z * 8 * dt;
        if (move.f) velocity.z -= speed * dt;
        if (move.b) velocity.z += speed * dt;
        if (move.l) velocity.x -= speed * dt;
        if (move.r) velocity.x += speed * dt;
        walker.moveRight(velocity.x * dt);
        walker.moveForward(-velocity.z * dt);
        camera.position.y = 2.0;
      } else {
        orbit.update();
      }
      renderer.render(scene, camera);
      labelRenderer.render(scene, camera);
    };
    animate();

    const onResize = () => {
      camera.aspect = W() / H();
      camera.updateProjectionMatrix();
      renderer.setSize(W(), H());
      labelRenderer.setSize(W(), H());
    };
    window.addEventListener('resize', onResize);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('resize', onResize);
      renderer.domElement.removeEventListener('click', onClick);
      orbit.dispose();
      walker.disconnect();
      renderer.dispose();
      scene.traverse((o: THREE.Object3D) => {
        const m = o as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
        if (m.material) {
          const mats = Array.isArray(m.material) ? m.material : [m.material];
          mats.forEach((mm: THREE.Material) => mm.dispose());
        }
      });
      mount.removeChild(renderer.domElement);
      mount.removeChild(labelRenderer.domElement);
      apiRef.current = null;
    };
  }, [campus]);

  return (
    <div className="c3d-root">
      <style>{CSS}</style>
      <div ref={mountRef} className="c3d-canvas" />

      <div className="c3d-panel c3d-title">
        <h1>
          <span className="ctp">CTP</span> 千葉工大 <span className="p">3Dキャンパス</span>
        </h1>
        <div className="c3d-campus">
          {CAMPUS_LIST.map((c) => (
            <button
              key={c}
              className={c === campus ? 'active' : ''}
              onClick={() => {
                setSelected(null);
                setCampus(c);
              }}
            >
              {c}
            </button>
          ))}
        </div>
        <p>公式マップ基準の近似配置。ドラッグ=回転 / ホイール=ズーム。建物クリックで情報、「歩く」で一人称(WASD)。</p>
      </div>

      <div className="c3d-panel c3d-list">
        <h2>{campus}キャンパス</h2>
        {items.map((b, i) => (
          <button key={b.name} onClick={() => apiRef.current?.focus(i)}>
            {b.name}
          </button>
        ))}
      </div>

      {selected && (
        <div className="c3d-panel c3d-info">
          <span className="close" onClick={() => setSelected(null)}>
            ×
          </span>
          <h3>{selected.name}</h3>
          <p>{selected.info ?? '(情報なし)'}</p>
        </div>
      )}

      <div className="c3d-panel c3d-controls">
        <button onClick={() => (mode === 'walk' ? apiRef.current?.exitWalk() : apiRef.current?.enterWalk())}>
          {mode === 'walk' ? '🛑 歩行をやめる (Esc)' : '🏃 歩く (一人称)'}
        </button>
        <button className="secondary" onClick={() => apiRef.current?.reset()}>
          視点リセット
        </button>
        <span className="hint">
          {mode === 'walk' ? 'WASD=移動 / マウス=視線 / Esc=戻る' : 'ドラッグ=回転 / ホイール=ズーム'}
        </span>
      </div>

      {mode === 'walk' && <div className="c3d-crosshair" />}
    </div>
  );
}

/* 実モデル(Blender)への差し替え: GLTFLoader で /campus.glb を読み込み、上の
   data ループを置換。棟ごとの mesh を meshes に push、userData に name/info、ラベルを add。 */

const CSS = `
.c3d-root { position:fixed; inset:0; overflow:hidden; font-family: system-ui,-apple-system,"Hiragino Sans",sans-serif; }
.c3d-canvas { position:absolute; inset:0; }
.c3d-panel { position:absolute; background:rgba(255,255,255,.92); color:#1E3A5F; border-radius:14px; box-shadow:0 8px 24px rgba(0,0,0,.18); backdrop-filter:blur(6px); }
.c3d-title { top:14px; left:14px; padding:12px 16px; max-width:min(80vw,380px); }
.c3d-title h1 { margin:0; font-size:16px; } .c3d-title h1 .ctp { color:#60A5FA; } .c3d-title h1 .p { color:#2563EB; }
.c3d-title p { margin:8px 0 0; font-size:12px; color:#516079; line-height:1.5; }
.c3d-campus { display:flex; gap:6px; margin-top:8px; }
.c3d-campus button { border:1px solid #d4def0; background:#fff; color:#2563EB; border-radius:999px; padding:5px 12px; font-size:12px; font-weight:700; cursor:pointer; }
.c3d-campus button.active { background:#2563EB; color:#fff; border-color:#2563EB; }
.c3d-controls { bottom:78px; left:14px; padding:10px 12px; display:flex; gap:8px; flex-wrap:wrap; align-items:center; }
.c3d-controls button { border:0; border-radius:10px; padding:8px 12px; font-size:13px; font-weight:600; cursor:pointer; background:#2563EB; color:#fff; }
.c3d-controls button.secondary { background:#e8eefb; color:#1E3A5F; }
.c3d-controls .hint { font-size:11px; color:#64748b; }
.c3d-list { top:14px; right:14px; padding:10px; width:168px; max-height:58vh; overflow:auto; }
.c3d-list h2 { margin:0 0 8px; font-size:12px; color:#64748b; font-weight:700; }
.c3d-list button { display:block; width:100%; text-align:left; border:0; background:transparent; color:#1E3A5F; padding:7px 9px; border-radius:8px; font-size:13px; cursor:pointer; }
.c3d-list button:hover { background:#eef3fc; }
.c3d-info { bottom:78px; right:14px; padding:14px 16px; width:240px; }
.c3d-info h3 { margin:0 0 6px; font-size:15px; color:#2563EB; }
.c3d-info p { margin:0; font-size:12.5px; color:#475569; line-height:1.6; }
.c3d-info .close { position:absolute; top:8px; right:10px; cursor:pointer; color:#94a3b8; font-size:18px; }
.c3d-label { color:#fff; background:rgba(30,58,95,.82); padding:2px 7px; border-radius:7px; font-size:11px; font-weight:700; white-space:nowrap; pointer-events:none; }
.c3d-label-field { background:rgba(60,110,60,.78); }
.c3d-crosshair { position:absolute; left:50%; top:50%; width:8px; height:8px; margin:-4px 0 0 -4px; border:2px solid rgba(255,255,255,.85); border-radius:50%; pointer-events:none; }
`;
