'use client';

/**
 * 出席モード設定（Client Component）
 *
 * WHY: 3 モード（manual / confirm / auto）から 1 つを選ぶ。
 * auto の実送信は「開発者コード（env ATTENDANCE_AUTO_DEV_CODE）を設定画面で入力して
 * 一致したときだけ解禁」される（[[attendance-rollout]]）。解禁後も Worker の多重ガード +
 * QR セッション検証 + dry-run 弁を通る。コード未設定（autoConfigured=false）のときは
 * auto を選べない（fail-closed）。
 */
import { useState } from 'react';
import type { AttendanceMode } from '@chibatech/shared';

interface ModeOption {
  value: AttendanceMode;
  label: string;
  description: string;
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
    label: '自動（開発者向け）',
    // WHY: 実送信には当日のQRスキャン（QRセッション）+ 学内ネットワーク + 開発者コード解禁が
    // 必要。モードを選ぶだけでは送信されない。
    description: '当日QRスキャン済みの授業だけ、条件をすべて満たした時に自動送信。有効化には開発者コードが必要',
  },
];

export function AttendanceSettings({
  initialMode,
  initialAutoUnlocked,
  autoConfigured,
}: {
  initialMode: AttendanceMode;
  initialAutoUnlocked: boolean;
  autoConfigured: boolean;
}) {
  const [mode, setMode] = useState<AttendanceMode>(initialMode);
  const [autoUnlocked, setAutoUnlocked] = useState(initialAutoUnlocked);
  const [codeOpen, setCodeOpen] = useState(false);
  const [code, setCode] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // mode を保存する共通処理。auto のときだけ devCode を送る。
  async function put(body: { mode: AttendanceMode; devCode?: string }): Promise<boolean> {
    setSaving(true);
    setError('');
    try {
      const resp = await fetch('/api/attendance/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (resp.ok) return true;
      if (resp.status === 403) {
        const data = (await resp.json().catch(() => null)) as { message?: string } | null;
        setError(data?.message ?? '解禁できませんでした');
      } else {
        setError('保存に失敗しました');
      }
      return false;
    } catch {
      setError('保存に失敗しました');
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function selectMode(next: AttendanceMode) {
    if (next === mode && !(next === 'auto' && !autoUnlocked)) return;
    setError('');

    if (next === 'auto') {
      // 既に解禁済みなら何もしない。未解禁ならコード入力欄を開く（送信はしない）。
      if (autoUnlocked) return;
      setCodeOpen(true);
      return;
    }

    // auto 以外: そのまま保存。autoUnlocked は false に戻る。
    const ok = await put({ mode: next });
    if (ok) {
      setMode(next);
      setAutoUnlocked(false);
      setCodeOpen(false);
      setCode('');
    }
  }

  async function submitCode() {
    const ok = await put({ mode: 'auto', devCode: code });
    if (ok) {
      setMode('auto');
      setAutoUnlocked(true);
      setCodeOpen(false);
      setCode('');
    }
  }

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <h2 className="text-sm font-semibold text-gray-700">出席モード</h2>
      <p className="mt-1 text-xs text-gray-400">通知時の挙動を選択します</p>

      <div className="mt-3 space-y-2">
        {MODE_OPTIONS.map((opt) => {
          const checked = mode === opt.value;
          const autoLocked = opt.value === 'auto' && !autoConfigured;
          const isDisabled = autoLocked || saving;
          return (
            <div key={opt.value}>
              <label
                className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${
                  checked
                    ? 'border-[#2563EB] bg-[#2563EB]/5'
                    : 'border-gray-200 bg-white hover:border-gray-300'
                } ${autoLocked ? 'cursor-not-allowed opacity-60' : ''}`}
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
                    {opt.value === 'auto' && checked && autoUnlocked && (
                      <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] text-green-700">
                        解禁済み
                      </span>
                    )}
                    {autoLocked && (
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] text-gray-500">
                        コード未設定
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-gray-500">{opt.description}</p>
                </div>
              </label>

              {/* auto を選んだがまだ未解禁: 開発者コード入力欄 */}
              {opt.value === 'auto' && codeOpen && autoConfigured && !autoUnlocked && (
                <div className="mt-2 flex items-center gap-2 pl-3">
                  <input
                    type="password"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder="開発者コード"
                    autoComplete="off"
                    disabled={saving}
                    className="min-w-0 flex-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm"
                  />
                  <button
                    type="button"
                    onClick={submitCode}
                    disabled={saving || code.length === 0}
                    className="rounded-md bg-[#2563EB] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                  >
                    解禁
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCodeOpen(false);
                      setCode('');
                      setError('');
                    }}
                    disabled={saving}
                    className="rounded-md px-2 py-1.5 text-xs text-gray-500"
                  >
                    取消
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </section>
  );
}
