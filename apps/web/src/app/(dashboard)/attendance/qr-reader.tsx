'use client';

/**
 * QR コード読み取り Client Component
 *
 * WHY: confirm モードの最初のステップ。カメラから QR を読み取り、
 * 文字列を onResult に渡す (パース・検証は呼び出し側で実施)。
 *
 * AGENTS.md「QR読み取りライブラリ採用方針」遵守事項:
 *   - client component 内だけで使う ('use client')
 *   - CDN ではなく npm 依存 (@zxing/browser)
 *   - 外部通信しない (zxing はブラウザ内で完結。telemetry を持たない)
 *   - カメラ権限失敗時に手動入力 / 再試行導線を用意
 *   - MediaDevices / QR decode はテストでモック
 *   - QR 内容は呼び出し側で必ず Zod 検証 (parseAttendanceQrUrl)
 *   - QR URL/token/session をログに出さない (本コンポーネント内では console 一切呼ばない)
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import { BrowserMultiFormatReader, type IScannerControls } from '@zxing/browser';

export type QrError = 'permission' | 'unsupported' | 'unknown';

/**
 * MediaDevices.getUserMedia 等から投げられる例外を、UI 表示用の
 * `QrError` コードに分類する。例外オブジェクトや message を直接
 * 表示しないために、name 属性のみで判定する。
 *
 * WHY: ブラウザ間で error.message のフォーマットが揃わず、stack に
 * 余計な情報が乗ることもあるため、固定の文字列コードに正規化する。
 */
export function classifyQrError(err: unknown): QrError {
  const name =
    err && typeof err === 'object' && 'name' in err ? String((err as { name: unknown }).name) : '';
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') return 'permission';
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') return 'unsupported';
  return 'unknown';
}

/**
 * 現在の環境で MediaDevices / getUserMedia が利用可能か判定する。
 *
 * WHY: SSR や非対応ブラウザ / iframe の sandbox では
 * `navigator.mediaDevices.getUserMedia` が無い。コンポーネントを
 * 描画する前に判定し、unsupported 表示に切り替える。
 */
export function isMediaDevicesAvailable(): boolean {
  if (typeof navigator === 'undefined') return false;
  if (!navigator.mediaDevices) return false;
  return typeof navigator.mediaDevices.getUserMedia === 'function';
}

export interface QrReaderProps {
  /**
   * QR が読み取れたら呼ばれる。raw 文字列をそのまま渡す。
   * 呼び出し側で Zod 検証して構造化データに変換する。
   */
  onResult: (text: string) => void;
  /**
   * カメラの起動を制御する。false にすると停止する。
   * 親コンポーネントでモード切替するために使う (デフォルト true)。
   */
  active?: boolean;
}

export function QrReader({ onResult, active = true }: QrReaderProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const [error, setError] = useState<QrError | null>(null);
  const [manualInput, setManualInput] = useState('');
  // WHY: 再試行のたびに再起動するキー。useEffect の依存に使う
  const [restartCount, setRestartCount] = useState(0);

  // WHY: onResult を ref に逃がして useEffect の依存から外す。
  // 親が毎レンダー新しい関数を渡してきても useEffect が再走しない。
  const onResultRef = useRef(onResult);
  useEffect(() => {
    onResultRef.current = onResult;
  }, [onResult]);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;

    setError(null);

    void (async () => {
      try {
        if (!isMediaDevicesAvailable()) {
          if (!cancelled) setError('unsupported');
          return;
        }

        if (!videoRef.current) return;

        const reader = new BrowserMultiFormatReader();
        const controls = await reader.decodeFromVideoDevice(
          undefined,
          videoRef.current,
          (result) => {
            if (result) {
              // WHY: 連続コールバックでも onResult は親が冪等に扱う前提。
              // raw 文字列を console.log しないこと (QR 内容流出防止)。
              onResultRef.current(result.getText());
            }
          }
        );

        if (cancelled) {
          controls.stop();
          return;
        }
        controlsRef.current = controls;
      } catch (err) {
        if (cancelled) return;
        // WHY: err 自体や err.message を画面に出さない。固定コードで分類してから
        // 文言を選ぶ (classifyQrError は単体テスト済み)
        setError(classifyQrError(err));
      }
    })();

    return () => {
      cancelled = true;
      controlsRef.current?.stop();
      controlsRef.current = null;
    };
  }, [active, restartCount]);

  const handleRetry = useCallback(() => {
    setError(null);
    setRestartCount((n) => n + 1);
  }, []);

  const handleManualSubmit = useCallback(() => {
    const value = manualInput.trim();
    if (!value) return;
    onResultRef.current(value);
    setManualInput('');
  }, [manualInput]);

  if (!active) return null;

  return (
    <section
      data-testid="qr-reader"
      className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm"
    >
      {error === null && (
        <div className="space-y-2">
          <p className="text-xs text-gray-500">教室の QR コードをカメラに向けてください</p>
          <video
            ref={videoRef}
            data-testid="qr-reader-video"
            className="aspect-square w-full rounded-md bg-black"
            playsInline
            muted
            autoPlay
          />
        </div>
      )}

      {error !== null && (
        <div data-testid="qr-reader-error" className="space-y-2">
          {error === 'permission' && (
            <p className="text-sm text-gray-700">
              カメラの使用が許可されていません。ブラウザ設定で許可してから再試行してください。
            </p>
          )}
          {error === 'unsupported' && (
            <p className="text-sm text-gray-700">
              このブラウザではカメラを利用できません。手動で URL を入力してください。
            </p>
          )}
          {error === 'unknown' && (
            <p className="text-sm text-gray-700">
              カメラの起動に失敗しました。再試行するか、手動で URL を入力してください。
            </p>
          )}
          <button
            type="button"
            onClick={handleRetry}
            className="rounded-md border border-gray-300 px-3 py-1 text-xs text-gray-700 hover:bg-gray-50"
          >
            再試行
          </button>
        </div>
      )}

      <div className="mt-3 space-y-1 border-t border-gray-100 pt-3">
        <label className="block text-xs text-gray-500" htmlFor="qr-manual-input">
          手動入力 (出席システムの URL)
        </label>
        <div className="flex gap-2">
          <input
            id="qr-manual-input"
            data-testid="qr-manual-input"
            type="url"
            inputMode="url"
            placeholder="https://..."
            value={manualInput}
            onChange={(e) => setManualInput(e.target.value)}
            className="min-w-0 flex-1 rounded-md border border-gray-300 px-2 py-1 text-sm"
          />
          <button
            type="button"
            data-testid="qr-manual-submit"
            onClick={handleManualSubmit}
            disabled={!manualInput.trim()}
            className="rounded-md bg-[#2563EB] px-3 py-1 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            読み込む
          </button>
        </div>
      </div>
    </section>
  );
}
