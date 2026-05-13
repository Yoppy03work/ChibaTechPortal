/**
 * 出席監査ログ utility のテスト
 *
 * WHY: append-only 監査ログの入力 → Prisma create data 変換で、
 *   - 全フィールドが undefined ではなく null に正規化される
 *   - phase != 'post_attempt' のとき outcome が null に強制される
 * を固定する。Prisma の `data: { x: undefined }` と `data: { x: null }` は
 * 挙動が異なる (前者は「更新しない」/ create では「DEFAULT」)。append-only で
 * create のみ使うとはいえ、null 一貫性を保つことで後段の集計クエリのブレを
 * 防ぐ。
 */
import { describe, it, expect } from 'vitest';
import {
  auditPhaseSchema,
  auditOutcomeSchema,
  toAttendanceAuditLogCreateData,
  type AttendanceAuditLogInput,
} from '../src/lib/attendance-audit';

describe('auditPhaseSchema', () => {
  it.each(['pre_attempt', 'post_attempt', 'skipped', 'blocked'] as const)(
    'phase=%s を許可する',
    (phase) => {
      expect(auditPhaseSchema.safeParse(phase).success).toBe(true);
    }
  );

  it('未知の phase を拒否する', () => {
    expect(auditPhaseSchema.safeParse('unknown').success).toBe(false);
    expect(auditPhaseSchema.safeParse('').success).toBe(false);
  });
});

describe('auditOutcomeSchema', () => {
  it.each(['success', 'failed'] as const)('outcome=%s を許可する', (outcome) => {
    expect(auditOutcomeSchema.safeParse(outcome).success).toBe(true);
  });

  it('未知の outcome を拒否する', () => {
    expect(auditOutcomeSchema.safeParse('partial').success).toBe(false);
  });
});

describe('toAttendanceAuditLogCreateData', () => {
  it('未指定フィールドは undefined ではなく null に正規化される', () => {
    const data = toAttendanceAuditLogCreateData({
      userId: 'user-1',
      phase: 'skipped',
      reason: 'pre-network reject',
    });

    expect(data).toEqual({
      userId: 'user-1',
      phase: 'skipped',
      timetableId: null,
      classDate: null,
      method: null,
      outcome: null,
      reason: 'pre-network reject',
      jobId: null,
      metadata: null,
    });
  });

  it('全フィールド指定時は値がそのまま入る (post_attempt + success)', () => {
    const classDate = new Date('2026-05-07T00:00:00Z');
    const data = toAttendanceAuditLogCreateData({
      userId: 'user-1',
      phase: 'post_attempt',
      timetableId: 'tt-1',
      classDate,
      method: 'auto',
      outcome: 'success',
      reason: null,
      jobId: 'bull-123',
      metadata: { sanitizedMessage: 'OK' },
    });

    expect(data.userId).toBe('user-1');
    expect(data.phase).toBe('post_attempt');
    expect(data.timetableId).toBe('tt-1');
    expect(data.classDate).toBe(classDate);
    expect(data.method).toBe('auto');
    expect(data.outcome).toBe('success');
    expect(data.jobId).toBe('bull-123');
    expect(data.metadata).toEqual({ sanitizedMessage: 'OK' });
  });

  it('phase != post_attempt のとき outcome は null に強制される', () => {
    // WHY: phase / outcome のセマンティクスを書き込み点で固定する。
    // skipped / blocked / pre_attempt で outcome を持つレコードは集計時に
    // ノイズになるため、書き込み側で常に null に倒す。
    const skipped = toAttendanceAuditLogCreateData({
      userId: 'user-1',
      phase: 'skipped',
      outcome: 'success' as const,
    });
    expect(skipped.outcome).toBeNull();

    const blocked = toAttendanceAuditLogCreateData({
      userId: 'user-1',
      phase: 'blocked',
      outcome: 'failed' as const,
    });
    expect(blocked.outcome).toBeNull();

    const pre = toAttendanceAuditLogCreateData({
      userId: 'user-1',
      phase: 'pre_attempt',
      outcome: 'success' as const,
    });
    expect(pre.outcome).toBeNull();
  });

  it('post_attempt で outcome 未指定のとき null になる', () => {
    const data = toAttendanceAuditLogCreateData({
      userId: 'user-1',
      phase: 'post_attempt',
    });
    expect(data.outcome).toBeNull();
  });
});
