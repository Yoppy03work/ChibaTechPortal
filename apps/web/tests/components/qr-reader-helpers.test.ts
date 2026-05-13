/**
 * QR Reader の純粋関数ロジックのテスト
 *
 * WHY: vitest の web パッケージ環境は `node` で .tsx を読まないため、
 * Component 全体の DOM テストはここでは行わず、エラー分類と環境チェックの
 * 純粋関数を抜き出して固定する。Component 全体の挙動は Playwright E2E で
 * カバーする予定。
 *
 * AGENTS.md QR ライブラリ採用方針の「MediaDevices / QR decode はテストでモック」
 * 条件はここでの mock 注入で満たす。
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  classifyQrError,
  isMediaDevicesAvailable,
} from '@/app/(dashboard)/attendance/qr-reader';

describe('classifyQrError', () => {
  it('NotAllowedError / PermissionDeniedError を permission に分類する', () => {
    expect(classifyQrError({ name: 'NotAllowedError' })).toBe('permission');
    expect(classifyQrError({ name: 'PermissionDeniedError' })).toBe('permission');
  });

  it('NotFoundError / DevicesNotFoundError を unsupported に分類する', () => {
    expect(classifyQrError({ name: 'NotFoundError' })).toBe('unsupported');
    expect(classifyQrError({ name: 'DevicesNotFoundError' })).toBe('unsupported');
  });

  it('未知の error は unknown に分類する', () => {
    expect(classifyQrError(new Error('boom'))).toBe('unknown');
    expect(classifyQrError({ name: 'SomethingElse' })).toBe('unknown');
    expect(classifyQrError(null)).toBe('unknown');
    expect(classifyQrError(undefined)).toBe('unknown');
    expect(classifyQrError('string error')).toBe('unknown');
  });
});

describe('isMediaDevicesAvailable', () => {
  const originalNavigator = globalThis.navigator;

  afterEach(() => {
    // WHY: navigator はテストごとに復元する
    Object.defineProperty(globalThis, 'navigator', {
      value: originalNavigator,
      writable: true,
      configurable: true,
    });
    vi.restoreAllMocks();
  });

  it('navigator が無い環境 (SSR) では false', () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: undefined,
      writable: true,
      configurable: true,
    });
    expect(isMediaDevicesAvailable()).toBe(false);
  });

  it('mediaDevices が無いブラウザでは false', () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: {},
      writable: true,
      configurable: true,
    });
    expect(isMediaDevicesAvailable()).toBe(false);
  });

  it('getUserMedia が関数でなければ false', () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: { mediaDevices: {} },
      writable: true,
      configurable: true,
    });
    expect(isMediaDevicesAvailable()).toBe(false);
  });

  it('getUserMedia が関数なら true', () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: { mediaDevices: { getUserMedia: () => Promise.resolve() } },
      writable: true,
      configurable: true,
    });
    expect(isMediaDevicesAvailable()).toBe(true);
  });
});
