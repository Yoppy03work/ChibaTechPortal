/**
 * 出席の時限スケジュール定数 + JST 時刻ユーティリティ（単一の真実源）
 *
 * WHY: 千葉工大の授業時刻は JST 固定。授業開始時刻・出席リード時間・JST 正規化は
 * confirm-guard / scheduler(リマインダ) など複数箇所で共通に使う。重複定義による
 * ドリフトを避けて 1 箇所に集約する。コンテナ TZ (Dockerfile/compose で未指定なら UTC)
 * に依存しないよう Intl Asia/Tokyo で時/分/曜日を取り出す。
 */

/**
 * 各時限の開始時刻（JST, 時:分）
 *
 * WHY: 千葉工大は 1時限=60分 の10限制（1限 9:00–10:00 … 10限 18:00–19:00）。
 * 実際の授業は 2 時限連続（例: 1-2限 = 9:00–11:00）で開講されることが多く、
 * 時間割データは時限ごとに 1 行になる。
 */
export const PERIOD_START_TIMES: Record<number, { hour: number; minute: number }> = {
  1: { hour: 9, minute: 0 },
  2: { hour: 10, minute: 0 },
  3: { hour: 11, minute: 0 },
  4: { hour: 12, minute: 0 },
  5: { hour: 13, minute: 0 },
  6: { hour: 14, minute: 0 },
  7: { hour: 15, minute: 0 },
  8: { hour: 16, minute: 0 },
  9: { hour: 17, minute: 0 },
  10: { hour: 18, minute: 0 },
};

/** 1時限の長さ（分） */
export const PERIOD_MINUTES = 60;

/** 授業開始の何分前を出席ターゲットにするか */
export const ATTENDANCE_LEAD_MINUTES = 5;

const JST_PARTS_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Tokyo',
  hour12: false,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  weekday: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

const DAY_OF_WEEK_MAP: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

export interface JstParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  dayOfWeek: number;
}

/**
 * Date を JST の 年/月/日/時/分/曜日 に分解する。コンテナ TZ 非依存。
 */
export function getJstParts(date: Date): JstParts {
  const parts = JST_PARTS_FORMATTER.formatToParts(date);
  const pick = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  // WHY: Intl は en-US / hour12:false で真夜中を "24" と返す実装がある (Chrome/Node)。
  // % 24 で 0 に正規化する。
  const rawHour = parseInt(pick('hour'), 10);
  return {
    year: parseInt(pick('year'), 10),
    month: parseInt(pick('month'), 10),
    day: parseInt(pick('day'), 10),
    hour: rawHour % 24,
    minute: parseInt(pick('minute'), 10),
    dayOfWeek: DAY_OF_WEEK_MAP[pick('weekday')] ?? 0,
  };
}
