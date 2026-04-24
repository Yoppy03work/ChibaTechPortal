/**
 * クライアントIP抽出テスト
 *
 * WHY: x-forwarded-for ヘッダ偽装への耐性と、opt-in 設計・不正設定値の fail-fast を検証する。
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
  const originalTrust = process.env.TRUST_X_FORWARDED_FOR;
  const originalCount = process.env.TRUSTED_PROXY_COUNT;

  afterEach(() => {
    if (originalTrust === undefined) delete process.env.TRUST_X_FORWARDED_FOR;
    else process.env.TRUST_X_FORWARDED_FOR = originalTrust;
    if (originalCount === undefined) delete process.env.TRUSTED_PROXY_COUNT;
    else process.env.TRUSTED_PROXY_COUNT = originalCount;
  });

  describe('opt-in 制御', () => {
    it('TRUST_X_FORWARDED_FOR 未設定なら x-forwarded-for があっても null', () => {
      // WHY: trusted proxy の仕組みがない環境で x-forwarded-for を信用すると
      // 偽装によって IP レートリミットが回避される。明示 opt-in まで常に null。
      delete process.env.TRUST_X_FORWARDED_FOR;
      expect(getClientIp(makeHeaders('203.0.113.50'))).toBeNull();
    });

    it('TRUST_X_FORWARDED_FOR=false も無効扱い（=== "true" のみ有効）', () => {
      process.env.TRUST_X_FORWARDED_FOR = 'false';
      expect(getClientIp(makeHeaders('203.0.113.50'))).toBeNull();
    });

    it('TRUST_X_FORWARDED_FOR="1" も無効扱い', () => {
      process.env.TRUST_X_FORWARDED_FOR = '1';
      expect(getClientIp(makeHeaders('203.0.113.50'))).toBeNull();
    });

    it('TRUST_X_FORWARDED_FOR=true でのみ有効になる', () => {
      process.env.TRUST_X_FORWARDED_FOR = 'true';
      process.env.TRUSTED_PROXY_COUNT = '0';
      expect(getClientIp(makeHeaders('203.0.113.50'))).toBe('203.0.113.50');
    });
  });

  describe('opt-in 有効時の x-forwarded-for 抽出', () => {
    beforeEach(() => {
      process.env.TRUST_X_FORWARDED_FOR = 'true';
    });

    it('x-forwarded-for がない場合は null', () => {
      expect(getClientIp(makeHeaders())).toBeNull();
    });

    it('空文字列の場合は null', () => {
      expect(getClientIp(makeHeaders(''))).toBeNull();
    });

    it('単一IP + TRUSTED_PROXY_COUNT=0 でそのまま返す', () => {
      process.env.TRUSTED_PROXY_COUNT = '0';
      expect(getClientIp(makeHeaders('203.0.113.50'))).toBe('203.0.113.50');
    });

    describe('TRUSTED_PROXY_COUNT=1（デフォルト）', () => {
      beforeEach(() => {
        process.env.TRUSTED_PROXY_COUNT = '1';
      });

      it('プロキシ1つでクライアントIPを抽出', () => {
        expect(getClientIp(makeHeaders('203.0.113.50, 10.0.0.1'))).toBe('203.0.113.50');
      });

      it('偽装ヘッダが付いていても正しいIPを返す', () => {
        expect(getClientIp(makeHeaders('1.2.3.4, 203.0.113.50, 10.0.0.1'))).toBe('203.0.113.50');
      });

      it('IPが1つしかない場合は最左を返す', () => {
        expect(getClientIp(makeHeaders('203.0.113.50'))).toBe('203.0.113.50');
      });
    });

    describe('TRUSTED_PROXY_COUNT=2', () => {
      beforeEach(() => {
        process.env.TRUSTED_PROXY_COUNT = '2';
      });

      it('2段プロキシでクライアントIPを抽出', () => {
        expect(getClientIp(makeHeaders('203.0.113.50, 10.0.0.1, 10.0.0.2'))).toBe('203.0.113.50');
      });
    });

    it('空白トリム', () => {
      process.env.TRUSTED_PROXY_COUNT = '1';
      expect(getClientIp(makeHeaders(' 203.0.113.50 , 10.0.0.1 '))).toBe('203.0.113.50');
    });

    it('x-real-ip は信用せず x-forwarded-for を採用', () => {
      process.env.TRUSTED_PROXY_COUNT = '1';
      const h = new Headers();
      h.set('x-real-ip', '198.51.100.10');
      h.set('x-forwarded-for', '203.0.113.50, 10.0.0.1');
      expect(getClientIp(h)).toBe('203.0.113.50');
    });

    it('x-real-ip だけなら null（x-forwarded-for がなければ無視）', () => {
      const h = new Headers();
      h.set('x-real-ip', '198.51.100.10');
      expect(getClientIp(h)).toBeNull();
    });
  });

  describe('TRUSTED_PROXY_COUNT の不正値は起動時 throw', () => {
    beforeEach(() => {
      process.env.TRUST_X_FORWARDED_FOR = 'true';
    });

    it('非数値は throw', () => {
      process.env.TRUSTED_PROXY_COUNT = 'abc';
      expect(() => getClientIp(makeHeaders('203.0.113.50'))).toThrow(/non-negative integer/);
    });

    it('負数は throw', () => {
      process.env.TRUSTED_PROXY_COUNT = '-1';
      expect(() => getClientIp(makeHeaders('203.0.113.50'))).toThrow(/non-negative integer/);
    });

    it('小数は throw', () => {
      process.env.TRUSTED_PROXY_COUNT = '1.5';
      expect(() => getClientIp(makeHeaders('203.0.113.50'))).toThrow(/non-negative integer/);
    });

    it('空文字列は throw', () => {
      process.env.TRUSTED_PROXY_COUNT = '';
      expect(() => getClientIp(makeHeaders('203.0.113.50'))).toThrow(/non-negative integer/);
    });

    it('0 は有効（プロキシなし構成）', () => {
      process.env.TRUSTED_PROXY_COUNT = '0';
      expect(() => getClientIp(makeHeaders('203.0.113.50'))).not.toThrow();
    });

    it('opt-in されていなければ不正値でも throw しない（未使用環境で起動失敗を避ける）', () => {
      delete process.env.TRUST_X_FORWARDED_FOR;
      process.env.TRUSTED_PROXY_COUNT = 'abc';
      expect(() => getClientIp(makeHeaders('203.0.113.50'))).not.toThrow();
      expect(getClientIp(makeHeaders('203.0.113.50'))).toBeNull();
    });
  });
});
