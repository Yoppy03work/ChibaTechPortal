'use client';

/**
 * 設定（設計 isSettings）。表示/通知/アカウント/外部サービス認証/アプリ情報。
 *
 * WHY: 文字サイズ・テーマは ThemeProvider に接続して実際に反映。通知・CIT/manaba 認証情報・
 * ログアウトは既存の実 API（/api/settings, /api/credentials, next-auth signOut）を保持する。
 * 認証情報はサーバー側で AES-256-GCM 暗号化して保存（平文はDBに残さない）。
 */
import { useEffect, useState } from 'react';
import { signOut } from 'next-auth/react';
import { useTheme } from '@/components/theme-provider';

interface Settings {
  notificationSettings: { pushEnabled: boolean; emailEnabled: boolean; sources: string[] };
  email: string;
  hasCitCreds: boolean;
  hasManabaCreds: boolean;
}

const card: React.CSSProperties = { overflow: 'hidden', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 18, boxShadow: 'var(--shadow-card)' };
const inputStyle: React.CSSProperties = { height: 42, padding: '0 13px', borderRadius: 10, border: '1px solid var(--line-2)', background: 'var(--surface)', color: 'var(--ink)', fontSize: 13.5, outline: 'none', width: '100%' };

function Segmented({ options, value, onChange }: { options: [string, string | number][]; value: string | number; onChange: (v: string | number) => void }) {
  return (
    <div style={{ display: 'flex', gap: 3, background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 999, padding: 3, flex: 'none' }}>
      {options.map(([label, v]) => {
        const active = value === v;
        return (
          <button key={label} type="button" onClick={() => onChange(v)} style={{ fontSize: 12, fontWeight: 700, padding: '5px 13px', borderRadius: 999, border: 'none', background: active ? 'var(--surface)' : 'transparent', color: active ? 'var(--ink)' : 'var(--ink-3)', boxShadow: active ? 'var(--shadow-sm)' : 'none' }}>{label}</button>
        );
      })}
    </div>
  );
}

function Switch({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={onClick} style={{ position: 'relative', width: 42, height: 24, borderRadius: 999, border: 'none', background: on ? 'var(--ink)' : 'var(--line-2)', flex: 'none' }}>
      <span style={{ position: 'absolute', top: 3, left: on ? 21 : 3, width: 18, height: 18, borderRadius: 999, background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,.3)', transition: 'left .15s' }} />
    </button>
  );
}

function Row({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, padding: '12px 0', borderTop: '1px solid var(--line)' }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>{title}</div>
        {desc && <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 2 }}>{desc}</div>}
      </div>
      {children}
    </div>
  );
}

export function SettingsForm({ studentId }: { studentId: string }) {
  const { theme, setTheme, fontScale, setFontScale } = useTheme();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);
  const [lang, setLang] = useState<string | number>('ja');

  const [citUserId, setCitUserId] = useState('');
  const [citPassword, setCitPassword] = useState('');
  const [manabaUserId, setManabaUserId] = useState('');
  const [manabaPassword, setManabaPassword] = useState('');
  const [credSaving, setCredSaving] = useState(false);
  const [credMessage, setCredMessage] = useState('');

  useEffect(() => {
    fetch('/api/settings').then((r) => r.json()).then(setSettings).catch(() => {});
  }, []);

  async function saveNotif(key: 'pushEnabled' | 'emailEnabled', value: boolean) {
    if (!settings) return;
    setSaving(true);
    const updated = { ...settings.notificationSettings, [key]: value };
    try {
      const resp = await fetch('/api/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updated) });
      if (resp.ok) setSettings({ ...settings, notificationSettings: updated });
    } finally {
      setSaving(false);
    }
  }

  async function saveCredentials() {
    setCredSaving(true);
    setCredMessage('');
    try {
      const resp = await fetch('/api/credentials', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ citPortalUserId: citUserId || undefined, citPortalPassword: citPassword || undefined, manabaUserId: manabaUserId || undefined, manabaPassword: manabaPassword || undefined }),
      });
      if (resp.ok) {
        setCredMessage('認証情報を保存しました');
        setCitPassword('');
        setManabaPassword('');
        setSettings((p) => (p ? { ...p, hasCitCreds: p.hasCitCreds || !!(citUserId && citPassword), hasManabaCreds: p.hasManabaCreds || !!(manabaUserId && manabaPassword) } : p));
      } else {
        setCredMessage('保存に失敗しました');
      }
    } finally {
      setCredSaving(false);
    }
  }

  function logout() {
    if (typeof navigator !== 'undefined' && navigator.serviceWorker?.controller) {
      navigator.serviceWorker.controller.postMessage({ type: 'CLEAR_CACHE' });
    }
    signOut({ callbackUrl: '/login' });
  }

  const push = settings?.notificationSettings.pushEnabled ?? false;
  const mail = settings?.notificationSettings.emailEnabled ?? false;

  return (
    <div className="ctp-screen ctp-cards" style={{ alignItems: 'start' }}>
      {/* 表示 */}
      <div style={{ ...card, padding: '18px 20px 6px' }}>
        <div style={{ fontSize: 14, fontWeight: 700, paddingBottom: 8 }}>表示</div>
        <Row title="文字サイズ" desc="画面全体の文字の大きさ">
          <Segmented options={[['小', 0.9], ['標準', 1], ['大', 1.1], ['特大', 1.25]]} value={fontScale} onChange={(v) => setFontScale(Number(v))} />
        </Row>
        <Row title="テーマ" desc="配色モード">
          <Segmented options={[['ライト', 'light'], ['ダーク', 'dark']]} value={theme} onChange={(v) => setTheme(v as 'light' | 'dark')} />
        </Row>
        <Row title="言語 / Language" desc="表示言語">
          <Segmented options={[['日本語', 'ja'], ['English', 'en']]} value={lang} onChange={setLang} />
        </Row>
      </div>

      {/* 通知 */}
      <div style={{ ...card, padding: '18px 20px 6px' }}>
        <div style={{ fontSize: 14, fontWeight: 700, paddingBottom: 8 }}>通知</div>
        <Row title="プッシュ通知" desc="重要・お知らせをブラウザに通知">
          <Switch on={push} onClick={() => saveNotif('pushEnabled', !push)} label="プッシュ通知" />
        </Row>
        <Row title="メール転送" desc="お知らせを大学メールに転送">
          <Switch on={mail} onClick={() => saveNotif('emailEnabled', !mail)} label="メール転送" />
        </Row>
        {saving && <div style={{ fontSize: 11, color: 'var(--ink-3)', padding: '0 0 10px' }}>保存中…</div>}
      </div>

      {/* アカウント */}
      <div style={{ ...card, padding: '18px 20px 6px' }}>
        <div style={{ fontSize: 14, fontWeight: 700, paddingBottom: 8 }}>アカウント</div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, padding: '8px 0', borderTop: '1px solid var(--line)' }}><span style={{ fontSize: 13, color: 'var(--ink-3)' }}>学籍番号</span><span style={{ fontSize: 13, fontWeight: 600, fontFamily: 'var(--font-mono)' }}>{studentId}</span></div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, padding: '8px 0', borderTop: '1px solid var(--line)' }}><span style={{ fontSize: 13, color: 'var(--ink-3)' }}>大学メール</span><span style={{ fontSize: 13, fontWeight: 600, fontFamily: 'var(--font-mono)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{settings?.email || '—'}</span></div>
        <button type="button" onClick={logout} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, padding: '12px 0', borderTop: '1px solid var(--line)', width: '100%', background: 'none', border: 'none', textAlign: 'left', color: 'var(--ink)' }}>
          <span style={{ fontSize: 13, fontWeight: 700 }}>ログアウト</span>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3" /><path d="M16 17l5-5-5-5M21 12H9" /></svg>
        </button>
      </div>

      {/* 外部サービス認証 */}
      <div style={{ ...card, padding: '18px 20px' }}>
        <div style={{ fontSize: 14, fontWeight: 700 }}>外部サービス認証</div>
        <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 3, lineHeight: 1.6 }}>CIT Portal・manaba のIDとパスワード。AES-256-GCM で暗号化して保存され、お知らせ等の取得に使われます。</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 14 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-2)' }}>CIT Portal ID {settings?.hasCitCreds && <span style={{ color: 'var(--ink-3)', fontWeight: 500 }}>（登録済み）</span>}</label>
          <input type="text" value={citUserId} onChange={(e) => setCitUserId(e.target.value)} placeholder="ユーザーID" style={inputStyle} />
          <input type="password" value={citPassword} onChange={(e) => setCitPassword(e.target.value)} placeholder="CIT Portal パスワード" style={inputStyle} />
          <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-2)', marginTop: 6 }}>manaba ID {settings?.hasManabaCreds && <span style={{ color: 'var(--ink-3)', fontWeight: 500 }}>（登録済み）</span>}</label>
          <input type="text" value={manabaUserId} onChange={(e) => setManabaUserId(e.target.value)} placeholder="ユーザーID" style={inputStyle} />
          <input type="password" value={manabaPassword} onChange={(e) => setManabaPassword(e.target.value)} placeholder="manaba パスワード" style={inputStyle} />
          {credMessage && <div style={{ fontSize: 12, color: credMessage.includes('失敗') ? 'var(--ink)' : 'var(--ink-2)' }}>{credMessage}</div>}
          <button type="button" onClick={saveCredentials} disabled={credSaving} style={{ height: 44, borderRadius: 11, border: 'none', background: 'var(--ink)', color: 'var(--surface)', fontSize: 13.5, fontWeight: 700, marginTop: 4, opacity: credSaving ? 0.7 : 1 }}>{credSaving ? '保存中…' : '認証情報を保存'}</button>
        </div>
      </div>

      {/* アプリ情報 */}
      <div style={{ ...card, padding: '18px 20px 6px' }}>
        <div style={{ fontSize: 14, fontWeight: 700, paddingBottom: 8 }}>アプリ情報</div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, padding: '8px 0', borderTop: '1px solid var(--line)' }}><span style={{ fontSize: 13, color: 'var(--ink-3)' }}>バージョン</span><span style={{ fontSize: 13, fontWeight: 600, fontFamily: 'var(--font-mono)' }}>1.0.0</span></div>
      </div>
    </div>
  );
}
