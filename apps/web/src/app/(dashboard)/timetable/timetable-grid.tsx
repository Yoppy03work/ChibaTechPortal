'use client';

/**
 * 時間割グリッド（Client Component）
 *
 * WHY: セルをタップして授業を追加/編集/削除するインタラクションが必要。
 */
import { useState } from 'react';

interface GridEntry {
  id: string;
  className: string;
  room: string | null;
}

interface Props {
  initialGrid: Record<string, GridEntry>;
  dayLabels: string[];
}

const PERIODS = [1, 2, 3, 4, 5, 6];
const WEEKDAYS = [1, 2, 3, 4, 5, 6]; // 月〜土

export function TimetableGrid({ initialGrid, dayLabels }: Props) {
  const [grid, setGrid] = useState(initialGrid);
  const [editing, setEditing] = useState<{ day: number; period: number } | null>(null);
  const [formName, setFormName] = useState('');
  const [formRoom, setFormRoom] = useState('');
  const [saving, setSaving] = useState(false);

  function openEditor(day: number, period: number) {
    const key = `${day}-${period}`;
    const existing = grid[key];
    setEditing({ day, period });
    setFormName(existing?.className || '');
    setFormRoom(existing?.room || '');
  }

  async function save() {
    if (!editing || !formName.trim()) return;
    setSaving(true);

    try {
      const resp = await fetch('/api/timetable', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dayOfWeek: editing.day,
          period: editing.period,
          className: formName.trim(),
          room: formRoom.trim() || undefined,
        }),
      });

      if (resp.ok) {
        const entry = await resp.json();
        const key = `${editing.day}-${editing.period}`;
        setGrid((prev) => ({
          ...prev,
          [key]: { id: entry.id, className: entry.className, room: entry.room },
        }));
        setEditing(null);
      }
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!editing) return;
    setSaving(true);

    try {
      await fetch(`/api/timetable?dayOfWeek=${editing.day}&period=${editing.period}`, {
        method: 'DELETE',
      });

      const key = `${editing.day}-${editing.period}`;
      setGrid((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      setEditing(null);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      {/* グリッド */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr>
              <th className="w-8 border border-gray-200 bg-gray-50 p-1" />
              {WEEKDAYS.map((d) => (
                <th key={d} className="border border-gray-200 bg-gray-50 p-1 font-medium">
                  {dayLabels[d]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PERIODS.map((p) => (
              <tr key={p}>
                <td className="border border-gray-200 bg-gray-50 p-1 text-center font-medium">
                  {p}
                </td>
                {WEEKDAYS.map((d) => {
                  const key = `${d}-${p}`;
                  const entry = grid[key];
                  return (
                    <td
                      key={key}
                      onClick={() => openEditor(d, p)}
                      className="h-16 cursor-pointer border border-gray-200 p-1 align-top hover:bg-blue-50"
                    >
                      {entry ? (
                        <>
                          <p className="font-medium text-[#1E3A5F] leading-tight">
                            {entry.className}
                          </p>
                          {entry.room && (
                            <p className="text-gray-400">{entry.room}</p>
                          )}
                        </>
                      ) : null}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 編集モーダル */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-sm rounded-lg bg-white p-4 shadow-lg">
            <h3 className="mb-3 font-bold text-[#1E3A5F]">
              {dayLabels[editing.day]}曜 {editing.period}限
            </h3>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600">授業名</label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="プログラミングII"
                  className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600">
                  教室（出席自動化に使用）
                </label>
                <input
                  type="text"
                  value={formRoom}
                  onChange={(e) => setFormRoom(e.target.value)}
                  placeholder="8109"
                  className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                />
              </div>
            </div>

            <div className="mt-4 flex gap-2">
              <button
                onClick={save}
                disabled={saving || !formName.trim()}
                className="flex-1 rounded bg-[#2563EB] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#1E3A5F] disabled:opacity-50"
              >
                保存
              </button>
              {grid[`${editing.day}-${editing.period}`] && (
                <button
                  onClick={remove}
                  disabled={saving}
                  className="rounded border border-red-300 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50"
                >
                  削除
                </button>
              )}
              <button
                onClick={() => setEditing(null)}
                className="rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
              >
                閉じる
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
