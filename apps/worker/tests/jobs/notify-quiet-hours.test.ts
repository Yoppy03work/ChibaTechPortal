/**
 * isQuietHours の JST 判定テスト
 *
 * WHY: quiet hours はユーザーの JST 設定。worker のコンテナ TZ (UTC) に依存せず
 * JST で判定することを固定する（UTC 13:00 = JST 22:00 を quiet と判定できるか）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// notify-job は import 時に BullMQ Queue / 各サービスを読むので mock する
vi.mock('bullmq', () => ({
  Queue: vi.fn().mockImplementation(() => ({ add: vi.fn() })),
  Worker: vi.fn().mockImplementation(() => ({ on: vi.fn() })),
}));
vi.mock('../../src/lib/redis', () => ({ bullmqConnection: {} }));
vi.mock('@chibatech/db', () => ({ prisma: {} }));
vi.mock('../../src/services/push-notification', () => ({ sendPushToUser: vi.fn() }));
vi.mock('../../src/services/email-notification', () => ({ sendEmail: vi.fn() }));
vi.mock('@chibatech/email-templates', () => ({ notificationEmail: vi.fn() }));

import { isQuietHours } from '../../src/jobs/notify-job';

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('isQuietHours (JST)', () => {
  it('start/end 未指定なら false', () => {
    expect(isQuietHours()).toBe(false);
    expect(isQuietHours('22:00')).toBe(false);
  });

  it('22:00-07:00 (日跨ぎ): JST 23:00 は quiet', () => {
    vi.setSystemTime(new Date('2026-05-04T14:00:00Z')); // JST 23:00
    expect(isQuietHours('22:00', '07:00')).toBe(true);
  });

  it('22:00-07:00: JST 06:00 (end 前) は quiet', () => {
    vi.setSystemTime(new Date('2026-05-03T21:00:00Z')); // JST 2026-05-04 06:00
    expect(isQuietHours('22:00', '07:00')).toBe(true);
  });

  it('22:00-07:00: JST 12:00 は quiet でない', () => {
    vi.setSystemTime(new Date('2026-05-04T03:00:00Z')); // JST 12:00
    expect(isQuietHours('22:00', '07:00')).toBe(false);
  });

  it('UTC コンテナでも JST で判定する (UTC 13:00 = JST 22:00 は quiet)', () => {
    // WHY: 旧実装 (now.getHours()) なら UTC 時 13 で 22-07 外 = false に誤判定していた。
    vi.setSystemTime(new Date('2026-05-04T13:00:00Z')); // UTC 13:00 = JST 22:00
    expect(isQuietHours('22:00', '07:00')).toBe(true);
  });
});
