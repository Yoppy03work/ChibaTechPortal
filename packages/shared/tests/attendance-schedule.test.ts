/**
 * attendance-schedule (時限定数 + JST ユーティリティ) のテスト
 *
 * WHY: confirm-guard / scheduler から重複定義を集約した単一の真実源。抽出による
 * 値ズレの回帰を防ぎ、getJstParts が TZ 非依存で JST を返すことを固定する。
 */
import { describe, it, expect } from 'vitest';
import {
  PERIOD_START_TIMES,
  ATTENDANCE_LEAD_MINUTES,
  getJstParts,
} from '../src/lib/attendance-schedule';

describe('attendance-schedule 定数', () => {
  it('PERIOD_START_TIMES は 1〜10 限 (毎時 60 分) の JST 開始時刻', () => {
    expect(PERIOD_START_TIMES).toEqual({
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
    });
  });

  it('ATTENDANCE_LEAD_MINUTES は 5', () => {
    expect(ATTENDANCE_LEAD_MINUTES).toBe(5);
  });
});

describe('getJstParts', () => {
  it('UTC instant を JST の 時/分/曜日 に分解する (TZ 非依存)', () => {
    // 2026-05-04T00:25:00Z = JST 2026-05-04(月) 09:25
    const p = getJstParts(new Date('2026-05-04T00:25:00Z'));
    expect(p).toEqual({
      year: 2026,
      month: 5,
      day: 4,
      hour: 9,
      minute: 25,
      dayOfWeek: 1,
    });
  });

  it('JST の日付境界をまたぐ instant も JST 日で返す (真夜中 24→0 正規化)', () => {
    // 2026-05-04T15:30:00Z = JST 2026-05-05(火) 00:30
    const p = getJstParts(new Date('2026-05-04T15:30:00Z'));
    expect(p.year).toBe(2026);
    expect(p.month).toBe(5);
    expect(p.day).toBe(5);
    expect(p.hour).toBe(0);
    expect(p.dayOfWeek).toBe(2);
  });
});
