/**
 * 出席ログの status / method の日本語ラベル
 *
 * WHY: 出席ページで status('pending'/'skipped' 等) や method('confirm') が生の英語文字列で
 * 表示されていた。表示用ラベルを一箇所に集約し、未知値はそのまま返す（誤表示防止）。
 */

export function attendanceStatusLabel(status: string): string {
  switch (status) {
    case 'success':
      return '出席';
    case 'failed':
      return '失敗';
    case 'skipped':
      return 'スキップ';
    case 'pending':
      return '処理中';
    case 'manual':
      return '手動';
    default:
      return status;
  }
}

export function attendanceMethodLabel(method: string): string {
  switch (method) {
    case 'auto':
      return '自動';
    case 'confirm':
      return '確認';
    case 'manual':
      return '手動';
    default:
      return method;
  }
}
