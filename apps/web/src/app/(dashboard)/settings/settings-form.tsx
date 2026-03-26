'use client';

/**
 * 設定フォーム（Client Component）
 *
 * WHY: 認証情報登録・通知設定・ログアウトのインタラクション。
 * 認証情報はフォームから平文で /api/credentials に送信され、サーバー側で
 * AES-256-GCMで暗号化してからDBに保存される。DBに平文は保存されない。
 */
import { useState, useEffect } from 'react';
import { signOut } from 'next-auth/react';

interface Settings {
  notificationSettings: {
    pushEnabled: boolean;
    emailEnabled: boolean;
    sources: string[];
  };
  email: string;
  hasCitCreds: boolean;
  hasManabaCreds: boolean;
}

export function SettingsForm() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);
  const [credSaving, setCredSaving] = useState(false);
  const [credMessage, setCredMessage] = useState('');

  // 認証情報フォーム
  const [citUserId, setCitUserId] = useState('');
  const [citPassword, setCitPassword] = useState('');
  const [manabaUserId, setManabaUserId] = useState('');
  const [manabaPassword, setManabaPassword] = useState('');

  useEffect(() => {
    fetch('/api/settings')
      .then((r) => r.json())
      .then(setSettings);
  }, []);

  async function saveNotificationSettings(key: string, value: boolean) {
    if (!settings) return;
    setSaving(true);

    const updated = {
      ...settings.notificationSettings,
      [key]: value,
    };

    try {
      const resp = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated),
      });
      if (resp.ok) {
        setSettings({ ...settings, notificationSettings: updated });
      }
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
        body: JSON.stringify({
          citPortalUserId: citUserId || undefined,
          citPortalPassword: citPassword || undefined,
          manabaUserId: manabaUserId || undefined,
          manabaPassword: manabaPassword || undefined,
        }),
      });

      if (resp.ok) {
        setCredMessage('認証情報を保存しました');
        setCitPassword('');
        setManabaPassword('');
        // 状態を更新
        setSettings((prev) =>
          prev
            ? {
                ...prev,
                hasCitCreds: prev.hasCitCreds || !!(citUserId && citPassword),
                hasManabaCreds: prev.hasManabaCreds || !!(manabaUserId && manabaPassword),
              }
            : prev
        );
      } else {
        setCredMessage('保存に失敗しました');
      }
    } finally {
      setCredSaving(false);
    }
  }

  if (!settings) {
    return <p className="text-sm text-gray-400">読み込み中...</p>;
  }

  return (
    <div className="space-y-6">
      {/* 認証情報 */}
      <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-gray-700">学内システム認証情報</h2>
        <p className="mb-3 text-xs text-gray-400">
          AES-256-GCMで暗号化して保存されます。平文はDBに保存されません。
        </p>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-600">
              CIT Portal ユーザーID
              {settings.hasCitCreds && <span className="ml-1 text-green-600">（登録済み）</span>}
            </label>
            <input
              type="text"
              value={citUserId}
              onChange={(e) => setCitUserId(e.target.value)}
              placeholder="ユーザーID"
              className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600">CIT Portal パスワード</label>
            <input
              type="password"
              value={citPassword}
              onChange={(e) => setCitPassword(e.target.value)}
              className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
            />
          </div>

          <hr className="border-gray-100" />

          <div>
            <label className="block text-xs font-medium text-gray-600">
              manaba ユーザーID
              {settings.hasManabaCreds && <span className="ml-1 text-green-600">（登録済み）</span>}
            </label>
            <input
              type="text"
              value={manabaUserId}
              onChange={(e) => setManabaUserId(e.target.value)}
              placeholder="ユーザーID"
              className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600">manaba パスワード</label>
            <input
              type="password"
              value={manabaPassword}
              onChange={(e) => setManabaPassword(e.target.value)}
              className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
            />
          </div>

          {credMessage && (
            <p className={`text-xs ${credMessage.includes('失敗') ? 'text-red-600' : 'text-green-600'}`}>
              {credMessage}
            </p>
          )}

          <button
            onClick={saveCredentials}
            disabled={credSaving}
            className="w-full rounded bg-[#2563EB] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#1E3A5F] disabled:opacity-50"
          >
            {credSaving ? '保存中...' : '認証情報を保存'}
          </button>
        </div>
      </section>

      {/* 通知設定 */}
      <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-gray-700">通知設定</h2>

        <div className="space-y-3">
          <ToggleRow
            label="Push通知"
            description="ブラウザにPush通知を送信"
            checked={settings.notificationSettings.pushEnabled}
            onChange={(v) => saveNotificationSettings('pushEnabled', v)}
            disabled={saving}
          />
          <ToggleRow
            label="メール通知"
            description="お知らせをメールで転送"
            checked={settings.notificationSettings.emailEnabled}
            onChange={(v) => saveNotificationSettings('emailEnabled', v)}
            disabled={saving}
          />
        </div>
      </section>

      {/* ログアウト */}
      <button
        onClick={async () => {
          // WHY: ログアウト前にSWキャッシュをクリアし、個人データがブラウザに残らないようにする
          if ('serviceWorker' in navigator) {
            const reg = await navigator.serviceWorker.ready;
            reg.active?.postMessage({ type: 'CLEAR_CACHE' });
          }
          signOut({ callbackUrl: '/login' });
        }}
        className="w-full rounded border border-red-300 px-3 py-2 text-sm text-red-600 hover:bg-red-50"
      >
        ログアウト
      </button>
    </div>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm font-medium text-gray-700">{label}</p>
        <p className="text-xs text-gray-400">{description}</p>
      </div>
      <button
        onClick={() => onChange(!checked)}
        disabled={disabled}
        className={`relative h-6 w-11 rounded-full transition-colors ${
          checked ? 'bg-[#2563EB]' : 'bg-gray-300'
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
            checked ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  );
}
