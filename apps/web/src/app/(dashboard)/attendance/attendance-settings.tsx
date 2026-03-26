'use client';

/**
 * 出席設定コンポーネント（Client Component）
 */
import { useState } from 'react';

export function AttendanceSettings({ initialAutoAttend }: { initialAutoAttend: boolean }) {
  const [autoAttend, setAutoAttend] = useState(initialAutoAttend);
  const [saving, setSaving] = useState(false);

  async function toggle() {
    const newValue = !autoAttend;
    setSaving(true);
    try {
      const resp = await fetch('/api/attendance/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ autoAttend: newValue }),
      });
      if (resp.ok) {
        setAutoAttend(newValue);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-gray-700">自動出席</h2>
          <p className="text-xs text-gray-400">授業開始5分前に自動で出席登録します</p>
        </div>
        <button
          onClick={toggle}
          disabled={saving}
          className={`relative h-6 w-11 rounded-full transition-colors ${
            autoAttend ? 'bg-[#2563EB]' : 'bg-gray-300'
          }`}
        >
          <span
            className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white transition-transform shadow-sm ${
              autoAttend ? 'translate-x-5' : 'translate-x-0'
            }`}
          />
        </button>
      </div>
    </section>
  );
}
