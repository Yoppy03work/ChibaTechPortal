'use client';

/**
 * confirm モードの確認フロー (Client Component)
 *
 * フロー:
 *   1. 「QR を読み取る」ボタンを押すと QrReader が起動
 *   2. QR が読み取れたら parseAttendanceQrUrl で検証
 *   3. 検証 OK → resolveAttendanceTarget で対象授業を特定
 *   4. プレビュー画面 (授業 / 教室 / 時刻) を表示
 *   5. ユーザーが「送信」ボタンを押す → /api/attendance/submit に POST
 *   6. サーバーが受付 (202) → BullMQ ジョブ投入 → Worker が adapter.attend
 *   7. 結果は Push 通知でユーザーに返る
 *
 * 送信不可条件 (送信ボタンを disabled にする):
 *   - target.kind !== 'unique' (none / ambiguous)
 *   - target.kind === 'unique' かつ target.timetable.room !== roomId (room mismatch)
 *   送信受付後 (submitting / accepted / failed) も disabled
 *
 * フロント側の送信不可条件はサーバー側 confirm-guard でも再検証される。
 * フロント検証バイパスでも /api/attendance/submit が 400 で拒否する。
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

type SubmitState =
  | { kind: 'idle' }
  | { kind: 'submitting' }
  | { kind: 'accepted' }
  | { kind: 'failed'; reason: string };

type FlowStep =
  | { kind: 'idle' }
  | { kind: 'scanning' }
  | {
      kind: 'previewing';
      roomId: string;
      target: AttendanceTargetResolution;
      submit: SubmitState;
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
      setStep({
        kind: 'previewing',
        roomId: parsed.roomId,
        target,
        submit: { kind: 'idle' },
      });
    },
    [timetables]
  );

  const handleSubmit = useCallback(async () => {
    if (step.kind !== 'previewing') return;
    if (step.target.kind !== 'unique') return;
    const tt = step.target.timetable;
    if (tt.room !== step.roomId) return;

    setStep({ ...step, submit: { kind: 'submitting' } });

    try {
      const today = new Date();
      const classDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

      const resp = await fetch('/api/attendance/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          timetableId: tt.id,
          roomId: step.roomId,
          classDate,
        }),
      });

      if (resp.ok) {
        setStep((prev) =>
          prev.kind === 'previewing' ? { ...prev, submit: { kind: 'accepted' } } : prev
        );
        return;
      }

      // WHY: サーバー側 confirm-guard が reject した場合、reason コードで詳細
      // メッセージを出し分ける。raw レスポンスは humanReason 経由で UI 文言化
      const body = (await resp.json().catch(() => ({}))) as { reason?: string };
      const reasonText = body.reason ? humanSubmitReason(body.reason) : '送信に失敗しました。';
      setStep((prev) =>
        prev.kind === 'previewing'
          ? { ...prev, submit: { kind: 'failed', reason: reasonText } }
          : prev
      );
    } catch {
      setStep((prev) =>
        prev.kind === 'previewing'
          ? {
              ...prev,
              submit: { kind: 'failed', reason: 'ネットワークエラーで送信できませんでした。' },
            }
          : prev
      );
    }
  }, [step]);

  const isScanning = step.kind === 'scanning';

  const targetCard = useMemo(() => {
    if (step.kind !== 'previewing') return null;
    return renderTargetCard(step.target, step.roomId);
  }, [step]);

  // WHY: 送信可否判定。room mismatch / ambiguous / none / submit 中・完了は disabled
  const submitDisabled = useMemo(() => {
    if (step.kind !== 'previewing') return true;
    if (step.target.kind !== 'unique') return true;
    if (step.target.timetable.room !== step.roomId) return true;
    return step.submit.kind !== 'idle';
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

          {step.submit.kind === 'idle' && (
            <div className="space-y-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
              <p className="font-medium">送信前の最終確認</p>
              <p>この内容で出席を登録します。間違いがあれば「やり直す」を押してください。</p>
            </div>
          )}

          {step.submit.kind === 'submitting' && (
            <div
              data-testid="confirm-submit-pending"
              className="rounded-md border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900"
            >
              送信中...
            </div>
          )}

          {step.submit.kind === 'accepted' && (
            <div
              data-testid="confirm-submit-accepted"
              className="rounded-md border border-green-200 bg-green-50 p-3 text-xs text-green-900"
            >
              <p className="font-medium">送信を受け付けました</p>
              <p>処理結果は通知でお知らせします。</p>
            </div>
          )}

          {step.submit.kind === 'failed' && (
            <div
              data-testid="confirm-submit-failed"
              className="rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-900"
            >
              {step.submit.reason}
            </div>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              data-testid="confirm-submit"
              disabled={submitDisabled}
              onClick={handleSubmit}
              className="flex-1 rounded-md bg-[#2563EB] px-4 py-2 text-sm font-medium text-white hover:bg-[#1d4ed8] disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-600"
            >
              {step.submit.kind === 'submitting' ? '送信中...' : '送信'}
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

function humanSubmitReason(reason: string): string {
  switch (reason) {
    case 'timetable_not_owned':
      return 'この時間割はあなたのものではありません。';
    case 'room_mismatch':
      return 'QR の教室コードが時間割の教室と一致しません。';
    case 'outside_time_window':
      return '出席登録できる時間帯ではありません。';
    case 'already_submitted':
      return 'すでに同じ授業で出席登録済みです。';
    case 'credentials_not_registered':
      return 'CIT Portal の認証情報が未登録です。設定から登録してください。';
    case 'class_date_mismatch':
      return '日付情報が現在の日付と一致しません。';
    default:
      return '送信が拒否されました。';
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
          <p className="text-xs text-red-700" data-testid="confirm-room-mismatch">
            ⚠ QR の教室コードが時間割と一致しないため、送信できません。
          </p>
        )}
      </div>
    );
  }

  if (target.kind === 'ambiguous') {
    return (
      <div className="space-y-1 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
        <p className="font-medium">対象授業が複数あります (送信不可)</p>
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
      <p className="font-medium">この時間に該当する授業が見つかりません (送信不可)</p>
      <p className="text-xs">QR の教室コード: {roomId}</p>
      <p className="text-xs">
        時間割の登録があるか、現在時刻が授業開始 5 分前 ±2 分の範囲か確認してください。
      </p>
    </div>
  );
}
