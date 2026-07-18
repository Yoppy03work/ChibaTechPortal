/**
 * 同名授業の「連続コマブロック」ユーティリティ（純関数）
 *
 * WHY: CIT の授業は 2〜3 時限連続で開講され、時間割データは時限ごとに 1 行になる。
 * 出席登録は**連続ブロックにつき 1 回**（ブロック先頭コマの開始時）でよい。
 * ただし同じ日に同名授業が非連続で入る場合（補講）は**別ブロック**で、
 * そのブロックの開始時に改めて出席登録が必要（実運用仕様, 2026-07-18 本人確認）。
 *
 * 例: 同じ日の「情報理論」が 1,2限 と 7,8限 にある場合
 *   → ブロックは [1,2] と [7,8] の2つ。1限で出席すれば2限は不要、
 *      7限（補講）は改めて出席が必要。
 */

export interface ClassPeriodRow {
  id: string;
  className: string;
  period: number;
}

/**
 * 同じ日の時間割行から、指定行が属する「同名授業の連続コマブロック」の行IDを返す。
 * 指定行が rows に無い場合は安全側でその行のみ（[timetableId]）を返す。
 */
export function blockRowIds(rows: ClassPeriodRow[], timetableId: string): string[] {
  const target = rows.find((r) => r.id === timetableId);
  if (!target) return [timetableId];

  const sameName = rows
    .filter((r) => r.className === target.className)
    .sort((a, b) => a.period - b.period);

  // 連続 run に分割（period 差が 1 なら同じブロック。同一 period の重複行は同ブロック扱い）
  const runs: ClassPeriodRow[][] = [];
  let run: ClassPeriodRow[] = [];
  for (const r of sameName) {
    if (run.length > 0) {
      const last = run[run.length - 1];
      if (r.period === last.period || r.period === last.period + 1) {
        run.push(r);
        continue;
      }
      runs.push(run);
      run = [r];
    } else {
      run = [r];
    }
  }
  if (run.length > 0) runs.push(run);

  const block = runs.find((rn) => rn.some((r) => r.id === timetableId));
  return block ? block.map((r) => r.id) : [timetableId];
}
