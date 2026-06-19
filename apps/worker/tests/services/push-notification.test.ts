/**
 * sendPushToUser の dead subscription 掃除テスト
 *
 * WHY: 失効した push subscription (410 Gone / 404) は DB から削除し、再送し続けない。
 * それ以外のエラーは subscription を残す。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// WHY: vi.mock factory は hoist されるため、参照する class/関数は vi.hoisted で先に用意して
// TDZ を避ける。WebPushError は service 側の instanceof と同一クラスである必要がある。
const { sendNotificationMock, WebPushError } = vi.hoisted(() => {
  class WebPushError extends Error {
    statusCode: number;
    constructor(statusCode: number) {
      super(`status ${statusCode}`);
      this.statusCode = statusCode;
    }
  }
  return { sendNotificationMock: vi.fn(), WebPushError };
});

vi.mock('web-push', () => ({
  default: {
    setVapidDetails: vi.fn(),
    sendNotification: (...a: unknown[]) => sendNotificationMock(...a),
    WebPushError,
  },
}));

const subFindMany = vi.fn();
const subDelete = vi.fn();
vi.mock('@chibatech/db', () => ({
  prisma: {
    pushSubscription: {
      findMany: (...a: unknown[]) => subFindMany(...a),
      delete: (...a: unknown[]) => subDelete(...a),
    },
  },
}));

import { sendPushToUser } from '../../src/services/push-notification';

beforeEach(() => {
  vi.clearAllMocks();
  subFindMany.mockResolvedValue([
    { id: 's1', endpoint: 'https://push/e', p256dh: 'p', auth: 'a' },
  ]);
  subDelete.mockResolvedValue({});
  sendNotificationMock.mockReset();
});

describe('sendPushToUser — dead subscription 掃除', () => {
  it('410 Gone でサブスクを削除する', async () => {
    sendNotificationMock.mockRejectedValue(new WebPushError(410));
    await sendPushToUser('u1', { title: 't', body: 'b' });
    expect(subDelete).toHaveBeenCalledWith({ where: { id: 's1' } });
  });

  it('404 でもサブスクを削除する', async () => {
    sendNotificationMock.mockRejectedValue(new WebPushError(404));
    await sendPushToUser('u1', { title: 't', body: 'b' });
    expect(subDelete).toHaveBeenCalledWith({ where: { id: 's1' } });
  });

  it('その他のエラー (500) では削除しない', async () => {
    sendNotificationMock.mockRejectedValue(new WebPushError(500));
    await sendPushToUser('u1', { title: 't', body: 'b' });
    expect(subDelete).not.toHaveBeenCalled();
  });

  it('成功時は削除しない', async () => {
    sendNotificationMock.mockResolvedValue({});
    await sendPushToUser('u1', { title: 't', body: 'b' });
    expect(subDelete).not.toHaveBeenCalled();
  });
});
