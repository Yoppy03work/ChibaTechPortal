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

// WHY: classDate は ISO 8601 (YYYY-MM-DD or full ISO) を受ける。
// クライアントが Date.toISOString() してもよいし 'YYYY-MM-DD' でも受け付ける。
const classDateSchema = z
  .string()
  .min(1)
  .max(40)
  .refine((s) => !Number.isNaN(Date.parse(s)), {
    message: 'classDate must be a valid ISO date string',
  });

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
