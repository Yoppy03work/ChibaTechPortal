'use client';

/**
 * confirm モードの確認フロー (Client Component)
 *
 * フロー:
 *   1. 「QR を読み取る」ボタンを押すと QrReader が起動
 *   2. QR が読み取れたら parseAttendanceQrUrl で検証
 *   3. 検証 OK → resolveAttendanceTarget で対象授業を特定
 *   4. プレビュー画面 (授業 / 教室 / 時刻) を表示
 *   5. 「送信」ボタン → 本 PR では disabled (送信 API は別 PR で実装)
 *
 * WHY: confirm モードは「ユーザーが自分の意図で送信する」ことが本質。
 * QR を読んだだけで送信せず、必ずプレビュー → 確定の 2 ステップを踏む。
 *
 * 本 PR には実送信処理を含めない。送信ボタンは「準備中」表示の disabled で、
 * 別 PR (`feat/attendance-confirm-submit`) で `/api/attendance/submit` を
 * 実装する。それまで外部システムへの実アクセスはゼロ。
 */
import { useCallback, useMemo, useState } from 'react';
import {
  parseAttendanceQrUrl,
  resolveAttendanceTarget,
  type AttendanceTargetResolution,
  type AttendanceTargetTimetable,
} from '@chibatech/shared';
import { QrReader } from './qr-reader';

export interface ConfirmFlowProps {
  /** 当該ユーザーの時間割。SSR で取得して props で渡す */
  timetables: AttendanceTargetTimetable[];
}

type FlowStep =
  | { kind: 'idle' }
  | { kind: 'scanning' }
  | {
      kind: 'previewing';
      roomId: string;
      target: AttendanceTargetResolution;
    }
  | { kind: 'qr_invalid'; reason: string };

export function ConfirmFlow({ timetables }: ConfirmFlowProps) {
  const [step, setStep] = useState<FlowStep>({ kind: 'idle' });

  const handleQrResult = useCallback(
    (raw: string) => {
      const parsed = parseAttendanceQrUrl(raw);
      if (!parsed.ok) {
        // WHY: raw 内容は表示しない (情報漏洩防止)。原因コードのみメッセージ化
        setStep({ kind: 'qr_invalid', reason: humanReason(parsed.reason) });
        return;
      }
      const target = resolveAttendanceTarget(timetables, new Date());
      setStep({ kind: 'previewing', roomId: parsed.roomId, target });
    },
    [timetables]
  );

  const isScanning = step.kind === 'scanning';

  // WHY: step.kind = 'previewing' 時に targetCard 用のデータを生成
  const targetCard = useMemo(() => {
    if (step.kind !== 'previewing') return null;
    return renderTargetCard(step.target, step.roomId);
  }, [step]);

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <h2 className="text-sm font-semibold text-gray-700">出席を登録 (確認モード)</h2>
      <p className="mt-1 text-xs text-gray-400">
        QR コードを読み取り、内容を確認してから送信します
      </p>

      {step.kind === 'idle' && (
        <button
          type="button"
          data-testid="confirm-start-scan"
          onClick={() => setStep({ kind: 'scanning' })}
          className="mt-3 rounded-md bg-[#2563EB] px-4 py-2 text-sm font-medium text-white hover:bg-[#1d4ed8]"
        >
          QR を読み取る
        </button>
      )}

      {isScanning && (
        <div className="mt-3 space-y-2">
          <QrReader onResult={handleQrResult} active={isScanning} />
          <button
            type="button"
            onClick={() => setStep({ kind: 'idle' })}
            className="rounded-md border border-gray-300 px-3 py-1 text-xs text-gray-700 hover:bg-gray-50"
          >
            キャンセル
          </button>
        </div>
      )}

      {step.kind === 'qr_invalid' && (
        <div data-testid="confirm-qr-invalid" className="mt-3 space-y-2">
          <p className="text-sm text-red-600">{step.reason}</p>
          <button
            type="button"
            onClick={() => setStep({ kind: 'scanning' })}
            className="rounded-md border border-gray-300 px-3 py-1 text-xs text-gray-700 hover:bg-gray-50"
          >
            もう一度読み取る
          </button>
        </div>
      )}

      {step.kind === 'previewing' && targetCard && (
        <div data-testid="confirm-preview" className="mt-3 space-y-3">
          {targetCard}
          <div className="space-y-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
            <p className="font-medium">送信前の最終確認</p>
            <p>
              この内容で出席を登録します。間違いがあれば「やり直す」を押してください。
            </p>
          </div>
          <div className="flex gap-2">
            {/* WHY: 送信処理は別 PR (`feat/attendance-confirm-submit`) で実装する。
                本 PR では disabled で「準備中」を明示する */}
            <button
              type="button"
              data-testid="confirm-submit"
              disabled
              className="flex-1 rounded-md bg-gray-300 px-4 py-2 text-sm font-medium text-gray-600 disabled:cursor-not-allowed"
              title="送信処理は別 PR で実装予定"
            >
              送信 (準備中)
            </button>
            <button
              type="button"
              onClick={() => setStep({ kind: 'idle' })}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              やり直す
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function humanReason(reason: string): string {
  switch (reason) {
    case 'invalid_url':
      return 'QR の内容が URL ではありません。';
    case 'unsupported_protocol':
      return 'QR の URL が https ではありません。';
    case 'host_not_allowed':
      return 'CIT のドメイン以外には対応していません。';
    case 'unsupported_path':
      return 'この QR は出席登録用ではありません。';
    case 'invalid_room_id':
      return '教室コードの形式が不正です。';
    default:
      return 'QR を解釈できませんでした。';
  }
}

function renderTargetCard(target: AttendanceTargetResolution, roomId: string) {
  if (target.kind === 'unique') {
    const tt = target.timetable;
    const roomMatches = tt.room === roomId;
    return (
      <div className="space-y-1 rounded-md border border-gray-200 bg-gray-50 p-3 text-sm">
        <p className="font-medium text-gray-800">
          {tt.period}限 {tt.className}
        </p>
        <p className="text-xs text-gray-500">
          時間割の教室: {tt.room ?? '(未登録)'}
        </p>
        <p className="text-xs text-gray-500">
          QR の教室コード: {roomId}
        </p>
        {!roomMatches && (
          <p className="text-xs text-amber-700">
            ⚠ QR の教室コードが時間割と一致しません。
          </p>
        )}
      </div>
    );
  }

  if (target.kind === 'ambiguous') {
    return (
      <div className="space-y-1 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
        <p className="font-medium">対象授業が複数あります</p>
        <ul className="list-disc pl-4 text-xs">
          {target.candidates.map((c) => (
            <li key={c.id}>
              {c.period}限 {c.className} ({c.room ?? '未登録'})
            </li>
          ))}
        </ul>
        <p className="text-xs">QR の教室コード: {roomId}</p>
      </div>
    );
  }

  return (
    <div className="space-y-1 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
      <p className="font-medium">この時間に該当する授業が見つかりません</p>
      <p className="text-xs">QR の教室コード: {roomId}</p>
      <p className="text-xs">
        時間割の登録があるか、現在時刻が授業開始 5 分前 ±2 分の範囲か確認してください。
      </p>
    </div>
  );
}
