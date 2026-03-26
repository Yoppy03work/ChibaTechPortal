/**
 * クライアントIP抽出テスト
 *
 * WHY: x-forwarded-forヘッダー偽装への耐性を検証する
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getClientIp } from '../../src/lib/client-ip';

function makeHeaders(xForwardedFor?: string): Headers {
  const h = new Headers();
  if (xForwardedFor) {
    h.set('x-forwarded-for', xForwardedFor);
  }
  return h;
}

describe('getClientIp', () => {
  const originalEnv = process.env.TRUSTED_PROXY_COUNT;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.TRUSTED_PROXY_COUNT;
    } else {
      process.env.TRUSTED_PROXY_COUNT = originalEnv;
    }
  });

  it('x-forwarded-forがない場合はunknownを返す', () => {
    expect(getClientIp(makeHeaders())).toBe('unknown');
  });

  it('単一IPの場合はそのまま返す（TRUSTED_PROXY_COUNT=0）', () => {
    process.env.TRUSTED_PROXY_COUNT = '0';
    expect(getClientIp(makeHeaders('203.0.113.50'))).toBe('203.0.113.50');
  });

  describe('TRUSTED_PROXY_COUNT=1（デフォルト）', () => {
    beforeEach(() => {
      process.env.TRUSTED_PROXY_COUNT = '1';
    });

    it('プロキシ1つの場合、クライアントIPを正しく抽出する', () => {
      // client → proxy → server
      // x-forwarded-for: <client>, <proxy>
      expect(getClientIp(makeHeaders('203.0.113.50, 10.0.0.1'))).toBe('203.0.113.50');
    });

    it('偽装ヘッダーが付いていても正しいIPを返す', () => {
      // attacker spoofs: "1.2.3.4" as first entry
      // real chain: 1.2.3.4, 203.0.113.50, 10.0.0.1
      //   spoofed    real-client   proxy
      // TRUSTED_PROXY_COUNT=1 → index = 3-1-1 = 1 → 203.0.113.50
      expect(getClientIp(makeHeaders('1.2.3.4, 203.0.113.50, 10.0.0.1'))).toBe('203.0.113.50');
    });

    it('IPが1つしかない場合はそれを返す', () => {
      // プロキシ数よりIPリストが短い → 最も左を使用
      expect(getClientIp(makeHeaders('203.0.113.50'))).toBe('203.0.113.50');
    });
  });

  describe('TRUSTED_PROXY_COUNT=2', () => {
    beforeEach(() => {
      process.env.TRUSTED_PROXY_COUNT = '2';
    });

    it('2段プロキシでクライアントIPを正しく抽出する', () => {
      // client → proxy1 → proxy2 → server
      // x-forwarded-for: <client>, <proxy1>, <proxy2>
      expect(getClientIp(makeHeaders('203.0.113.50, 10.0.0.1, 10.0.0.2'))).toBe('203.0.113.50');
    });

    it('偽装+2段プロキシでも正しいIPを返す', () => {
      // spoofed, real-client, proxy1, proxy2
      expect(getClientIp(makeHeaders('1.2.3.4, 203.0.113.50, 10.0.0.1, 10.0.0.2'))).toBe('203.0.113.50');
    });
  });

  it('空白を含むヘッダーを正しくトリムする', () => {
    process.env.TRUSTED_PROXY_COUNT = '1';
    expect(getClientIp(makeHeaders(' 203.0.113.50 , 10.0.0.1 '))).toBe('203.0.113.50');
  });

  it('空文字列の場合はunknownを返す', () => {
    expect(getClientIp(makeHeaders(''))).toBe('unknown');
  });
});
