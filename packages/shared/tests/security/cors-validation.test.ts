/**
 * CORS Origin検証テスト
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { isOriginAllowed, ALLOWED_ORIGINS } from '../../src/lib/security-headers';

describe('isOriginAllowed', () => {
  const originalEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  it('nullオリジン（same-origin）は許可する', () => {
    expect(isOriginAllowed(null)).toBe(true);
  });

  it('ALLOWED_ORIGINSに含まれるオリジンを許可する', () => {
    expect(isOriginAllowed('https://chibatech-portal.example.com')).toBe(true);
  });

  it('ALLOWED_ORIGINSに含まれないオリジンを拒否する', () => {
    expect(isOriginAllowed('https://evil.com')).toBe(false);
    expect(isOriginAllowed('https://attacker.example.com')).toBe(false);
  });

  it('開発環境ではlocalhostを許可する', () => {
    process.env.NODE_ENV = 'development';
    expect(isOriginAllowed('http://localhost:3000')).toBe(true);
    expect(isOriginAllowed('http://localhost:3001')).toBe(true);
    expect(isOriginAllowed('http://localhost:8080')).toBe(true);
  });

  // WHY: docker-compose で web を 127.0.0.1:3001 に bind するため、
  // ブラウザがそのまま 127.0.0.1 でアクセスすると Origin が
  // http://127.0.0.1:3001 になる。localhost と同じ扱いで許可する必要がある。
  it('開発環境では 127.0.0.1 を許可する', () => {
    process.env.NODE_ENV = 'development';
    expect(isOriginAllowed('http://127.0.0.1:3001')).toBe(true);
    expect(isOriginAllowed('http://127.0.0.1:3000')).toBe(true);
  });

  it('開発環境では IPv6 ループバック [::1] を許可する', () => {
    process.env.NODE_ENV = 'development';
    expect(isOriginAllowed('http://[::1]:3001')).toBe(true);
  });

  it('本番環境ではlocalhostを拒否する', () => {
    process.env.NODE_ENV = 'production';
    expect(isOriginAllowed('http://localhost:3000')).toBe(false);
  });

  it('本番環境では 127.0.0.1 / [::1] も拒否する', () => {
    process.env.NODE_ENV = 'production';
    expect(isOriginAllowed('http://127.0.0.1:3001')).toBe(false);
    expect(isOriginAllowed('http://[::1]:3001')).toBe(false);
  });

  it('空文字列のオリジンを拒否する', () => {
    expect(isOriginAllowed('')).toBe(false);
  });

  it('ALLOWED_ORIGINSのサブドメインは許可しない（完全一致）', () => {
    expect(isOriginAllowed('https://sub.chibatech-portal.example.com')).toBe(false);
  });
});
