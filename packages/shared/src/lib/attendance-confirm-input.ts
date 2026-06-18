/**
 * confirm submit API の入力 zod schema
 *
 * WHY: `POST /api/attendance/submit` で受ける入力を共通定義する。Web API
 * 側の zod 検証 + Worker 側で再検証する際の型一貫性のため shared に置く。
 *
 * QR から取り出した roomId は parseAttendanceQrUrl で既に正規化されている
 * 想定だが、API 層では untrusted 入力として再検証する (フロント検証の
 * バイパス耐性)。
 */
import { z } from 'zod';

// WHY: roomId は parseAttendanceQrUrl と同じ regex を再利用
//   - 数字 / 英字 / ハイフン / アンダースコアの 1〜32 文字
const roomIdSchema = z
  .string()
  .min(1, 'roomId is empty')
  .max(32, 'roomId is too long')
  .regex(/^[A-Za-z0-9_-]+$/, 'roomId contains invalid characters');

// WHY: classDate は厳密に `YYYY-MM-DD` (10 文字) のカレンダー日のみ受ける。
// 当初は full ISO も許容していたが、`'2026-05-04T00:00:00+09:00'` のように
// TZ 付き文字列を受けると、サーバの toClassDate() がローカル TZ で truncate して
// JST 視点のカレンダー日と乖離する (UTC コンテナで `2026-05-03` に潰れる)。
// frontend は `YYYY-MM-DD` で送る規約 (confirm-flow.tsx) なので強制する。
// 加えて存在しない日 (`2026-02-30` 等) も refine で弾く。
const classDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'classDate must be YYYY-MM-DD')
  .refine(
    (s) => {
      const [y, m, d] = s.split('-').map(Number);
      const dt = new Date(Date.UTC(y, m - 1, d));
      // round-trip で month/day が一致すれば実在日
      return (
        dt.getUTCFullYear() === y &&
        dt.getUTCMonth() === m - 1 &&
        dt.getUTCDate() === d
      );
    },
    { message: 'classDate must be a real calendar date' }
  );

// WHY: timetableId は Prisma の uuid デフォルト形式に合わせる
//   - cuid もあり得るので、形式はゆるめに英数字 + ハイフン (最長 40)
const timetableIdSchema = z
  .string()
  .min(1)
  .max(40)
  .regex(/^[A-Za-z0-9-]+$/, 'timetableId contains invalid characters');

export const confirmSubmitInputSchema = z.object({
  timetableId: timetableIdSchema,
  roomId: roomIdSchema,
  classDate: classDateSchema,
});

export type ConfirmSubmitInput = z.infer<typeof confirmSubmitInputSchema>;
