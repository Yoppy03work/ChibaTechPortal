'use client';

/**
 * 出席モード設定（Client Component）
 *
 * WHY: 3 モード（manual / confirm / auto）から 1 つを選ぶ。
 * auto の実送信は Worker 側の段階解禁フラグ（attendance-rollout: マスタースイッチ +
 * allowlist + dry-run、いずれも fail-closed 既定OFF）と多重ガード + QRセッション検証で
 * 制御される。UI で auto を選んでも env を解禁しない限り外部送信は発生しない。
 */
import { useState } from 'react';
import type { AttendanceMode } from '@chibatech/shared';

interface ModeOption {
  value: AttendanceMode;
  label: string;
  description: string;
  disabled?: boolean;
  disabledReason?: string;
}

const MODE_OPTIONS: ModeOption[] = [
  {
    value: 'manual',
    label: '手動',
    description: '通知から手動でリンクを開く。最も安全',
  },
  {
    value: 'confirm',
    label: '確認',
    description: '通知でプレビューを表示し、ユーザーがOKを押すと送信',
  },
  {
    value: 'auto',
    label: '自動',
    // WHY: 実送信には当日のQRスキャン（QRセッション）+ 学内ネットワーク + Worker側の
    // 段階解禁フラグが必要。モードを選ぶだけでは送信されない。
    description: '当日QRスキャン済みの授業だけ、条件をすべて満たした時に自動送信（段階解禁中）',
  },
];

export function AttendanceSettings({ initialMode }: { initialMode: AttendanceMode }) {
  const [mode, setMode] = useState<AttendanceMode>(initialMode);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function selectMode(next: AttendanceMode) {
    if (next === mode) return;
    setSaving(true);
    setError('');
    try {
      const resp = await fetch('/api/attendance/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: next }),
      });
      if (resp.ok) {
        setMode(next);
      } else {
        setError('保存に失敗しました');
      }
    } catch {
      setError('保存に失敗しました');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <h2 className="text-sm font-semibold text-gray-700">出席モード</h2>
      <p className="mt-1 text-xs text-gray-400">通知時の挙動を選択します</p>

      <div className="mt-3 space-y-2">
        {MODE_OPTIONS.map((opt) => {
          const checked = mode === opt.value;
          const isDisabled = opt.disabled || saving;
          return (
            <label
              key={opt.value}
              className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${
                checked
                  ? 'border-[#2563EB] bg-[#2563EB]/5'
                  : 'border-gray-200 bg-white hover:border-gray-300'
              } ${opt.disabled ? 'cursor-not-allowed opacity-60' : ''}`}
            >
              <input
                type="radio"
                name="attendance-mode"
                value={opt.value}
                checked={checked}
                disabled={isDisabled}
                onChange={() => selectMode(opt.value)}
                className="mt-0.5 h-4 w-4 cursor-pointer accent-[#2563EB] disabled:cursor-not-allowed"
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-gray-700">{opt.label}</p>
                  {opt.disabled && (
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] text-gray-500">
                      準備中
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-gray-500">{opt.description}</p>
                {opt.disabled && opt.disabledReason && (
                  <p className="mt-1 text-xs text-gray-400">{opt.disabledReason}</p>
                )}
              </div>
            </label>
          );
        })}
      </div>

      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </section>
  );
}
