/**
 * 出席ジョブのキュー名 / ジョブ名定数
 *
 * WHY: Producer (apps/web の confirm submit API) と Consumer (apps/worker の
 * attendance-job) で同じ文字列を共有する必要がある。文字列リテラルを 2 箇所に
 * 書いて typo するリスクを避けるため、shared 側に唯一の定義を置く。
 */
export const ATTENDANCE_QUEUE_NAME = 'attendance';
export const ATTENDANCE_JOB_NAME = 'attend';
