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
 */
export function createAttendanceAdapter(): AttendanceAdapter {
  return new AttendanceHttpAdapter();
}
