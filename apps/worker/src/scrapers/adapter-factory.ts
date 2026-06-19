/**
 * アダプタファクトリ
 *
 * WHY: HTTP → Playwright の順で試行し、HTTPで済む場合はPlaywrightを起動しない。
 * 各ターゲットに対して最適なアダプタを自動選択する。
 */
import type { ScraperAdapter, AttendanceAdapter } from '@chibatech/shared';
import { CitPortalHttpAdapter } from './adapters/cit-portal-http';
import { ManabaHttpAdapter } from './adapters/manaba-http';
import { AttendanceHttpAdapter } from './adapters/attendance-http';
import { MockAttendanceAdapter } from './adapters/attendance-mock';

type ScraperTarget = 'cit-portal' | 'manaba';

/**
 * スクレイパーアダプタを生成する（CIT Portal / manaba）
 */
export function createAdapter(target: ScraperTarget): ScraperAdapter {
  switch (target) {
    case 'cit-portal':
      return new CitPortalHttpAdapter();
    case 'manaba':
      return new ManabaHttpAdapter();
    default: {
      const _exhaustive: never = target;
      throw new Error(`Unknown scraper target: ${_exhaustive}`);
    }
  }
}

/**
 * 出席アダプタを生成する
 *
 * WHY: ローカル / dev で CIT_Wi-Fi なしに全経路を検証するため、ATTENDANCE_ADAPTER=mock
 * のときだけモックを返す。本番混入を防ぐため production では mock 指定を拒否する。
 */
export function createAttendanceAdapter(): AttendanceAdapter {
  if (process.env.ATTENDANCE_ADAPTER === 'mock') {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('ATTENDANCE_ADAPTER=mock is not allowed in production');
    }
    return new MockAttendanceAdapter();
  }
  return new AttendanceHttpAdapter();
}
