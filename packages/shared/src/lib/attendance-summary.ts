/**
 * 出席ログの集計（純関数）
 *
 * WHY: 出席統計（成功率・方式別・授業別）の計算ロジックを UI/API から分離して
 * 単体テスト可能にする。AttendanceLog の status/method/授業名 だけに依存する。
 */

export interface AttendanceLogSummaryItem {
  status: string; // 'success' | 'failed' | 'skipped' | 'pending' | 'manual'
  method: string; // 'auto' | 'confirm' | 'manual' | ...
  className: string;
}

export interface AttendanceSummary {
  total: number;
  success: number;
  failed: number;
  skipped: number;
  /** 成功 / (成功 + 失敗)。試行がなければ 0。0〜1。 */
  successRate: number;
  byMethod: { auto: number; confirm: number; manual: number; other: number };
  /** 授業別の出席状況（件数降順） */
  byClass: Array<{ className: string; total: number; success: number }>;
}

export function summarizeAttendance(
  logs: AttendanceLogSummaryItem[]
): AttendanceSummary {
  let success = 0;
  let failed = 0;
  let skipped = 0;
  const byMethod = { auto: 0, confirm: 0, manual: 0, other: 0 };
  const byClassMap = new Map<string, { total: number; success: number }>();

  for (const log of logs) {
    if (log.status === 'success') success++;
    else if (log.status === 'failed') failed++;
    else if (log.status === 'skipped') skipped++;

    if (log.method === 'auto') byMethod.auto++;
    else if (log.method === 'confirm') byMethod.confirm++;
    else if (log.method === 'manual') byMethod.manual++;
    else byMethod.other++;

    const c = byClassMap.get(log.className) ?? { total: 0, success: 0 };
    c.total++;
    if (log.status === 'success') c.success++;
    byClassMap.set(log.className, c);
  }

  const attempts = success + failed;
  const successRate = attempts === 0 ? 0 : success / attempts;
  const byClass = [...byClassMap.entries()]
    .map(([className, v]) => ({ className, total: v.total, success: v.success }))
    .sort((a, b) => b.total - a.total);

  return {
    total: logs.length,
    success,
    failed,
    skipped,
    successRate,
    byMethod,
    byClass,
  };
}
