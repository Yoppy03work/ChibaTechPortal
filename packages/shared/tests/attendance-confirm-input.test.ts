/**
 * confirm submit 入力 zod スキーマのテスト
 *
 * WHY: API ハンドラの第一防衛線。untrusted JSON ペイロードを構造化データに
 * 落とす境界をここで固定する。フロントの parseAttendanceQrUrl と同じ roomId
 * 規則を使うが、API では再検証する。
 */
import { describe, expect, it } from 'vitest';
import { confirmSubmitInputSchema } from '../src/lib/attendance-confirm-input';

describe('confirmSubmitInputSchema', () => {
  it('正常な入力を受け入れる', () => {
    const r = confirmSubmitInputSchema.safeParse({
      timetableId: 'abcdef12-3456-7890-abcd-ef0123456789',
      roomId: '8109',
      classDate: '2026-05-12',
    });
    expect(r.success).toBe(true);
  });

  it('ISO datetime 形式の classDate も受け入れる', () => {
    const r = confirmSubmitInputSchema.safeParse({
      timetableId: 'tt-1',
      roomId: '8109',
      classDate: '2026-05-12T00:00:00.000Z',
    });
    expect(r.success).toBe(true);
  });

  it('roomId に空白が含まれると拒否', () => {
    const r = confirmSubmitInputSchema.safeParse({
      timetableId: 'tt-1',
      roomId: '8109 ext',
      classDate: '2026-05-12',
    });
    expect(r.success).toBe(false);
  });

  it('roomId が空だと拒否', () => {
    const r = confirmSubmitInputSchema.safeParse({
      timetableId: 'tt-1',
      roomId: '',
      classDate: '2026-05-12',
    });
    expect(r.success).toBe(false);
  });

  it('classDate が解釈不能だと拒否', () => {
    const r = confirmSubmitInputSchema.safeParse({
      timetableId: 'tt-1',
      roomId: '8109',
      classDate: 'not-a-date',
    });
    expect(r.success).toBe(false);
  });

  it('必須フィールド欠如で拒否', () => {
    expect(confirmSubmitInputSchema.safeParse({ roomId: '8109', classDate: '2026-05-12' }).success).toBe(
      false
    );
    expect(
      confirmSubmitInputSchema.safeParse({ timetableId: 'tt-1', classDate: '2026-05-12' }).success
    ).toBe(false);
    expect(
      confirmSubmitInputSchema.safeParse({ timetableId: 'tt-1', roomId: '8109' }).success
    ).toBe(false);
  });

  it('timetableId に特殊文字が含まれると拒否', () => {
    const r = confirmSubmitInputSchema.safeParse({
      timetableId: "tt-1' OR 1=1--",
      roomId: '8109',
      classDate: '2026-05-12',
    });
    expect(r.success).toBe(false);
  });
});
