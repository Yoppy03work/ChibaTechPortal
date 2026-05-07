/**
 * 出席監査ログの型・スキーマ
 *
 * WHY: 出席 auto 解禁条件 (AGENTS.md) の「送信前後の監査ログが残る」を
 * 実現するための共通型。Worker が attendance-job 内で記録するイベントの
 * phase / outcome / reason / metadata を 1 箇所で定義する。
 *
 * append-only 設計:
 *   - 書き込みのみ提供。update / delete の関数は意図的に出さない。
 *   - 既存行の上書きはせず、状態遷移は新しい行を append することで表現する。
 *   - DB レベルの append-only 強制 (Postgres role 権限分離) は運用 PR で対応。
 */
import { z } from 'zod';
import type { AttendanceMode } from './scraper-adapter';

/**
 * 監査ログの phase。
 *
 * - `pre_attempt`: adapter.attend() を呼ぶ直前の記録。実 HTTP 送信の前に
 *   「これから送る」事実を残す。
 * - `post_attempt`: adapter.attend() の戻り値を受け取った直後の記録。
 *   outcome に 'success' / 'failed' を入れる。
 * - `skipped`: pre-network guard で reject した記録。reason に理由文字列。
 *   adapter には触れない。
 * - `blocked`: zod 検証失敗 / timetable 不在など、ガード以前の段階で
 *   ジョブが進めなかった記録。
 */
export const auditPhaseSchema = z.enum(['pre_attempt', 'post_attempt', 'skipped', 'blocked']);
export type AuditPhase = z.infer<typeof auditPhaseSchema>;

/**
 * post_attempt 時の outcome。pre_attempt / skipped / blocked では null。
 */
export const auditOutcomeSchema = z.enum(['success', 'failed']);
export type AuditOutcome = z.infer<typeof auditOutcomeSchema>;

/**
 * 監査ログ書き込み入力。
 *
 * WHY: Worker から prisma.attendanceAuditLog.create に渡す前にこの形に整形する。
 * reason / metadata は呼び出し側でサニタイズ済みの値を渡す前提 (本ユーティリティ
 * では追加サニタイズしない。外部 HTML が入る経路では sanitizeExternalText 経由)。
 */
export interface AttendanceAuditLogInput {
  userId: string;
  phase: AuditPhase;
  // pre_attempt / post_attempt / skipped で記録する文脈情報。blocked では一部 null
  timetableId?: string | null;
  classDate?: Date | null;
  method?: AttendanceMode | null;
  outcome?: AuditOutcome | null;
  reason?: string | null;
  jobId?: string | null;
  metadata?: Record<string, unknown> | null;
}

/**
 * 入力を Prisma create data の形に正規化する。
 *
 * WHY: Prisma の data に undefined を渡すと「省略」扱いとなり、null 渡しと
 * 区別される。ここで全フィールドを `value ?? null` に倒し、明示的な null を
 * 渡す形に統一する。append-only なので update は呼ばないが、後段で
 * `findUnique` 検索条件に使う際に null/undefined のブレを防ぐ意図もある。
 */
export function toAttendanceAuditLogCreateData(input: AttendanceAuditLogInput) {
  // outcome の整合性チェック: post_attempt 以外で outcome が入っていれば落とす
  // WHY: phase と outcome のセマンティクスを書き込み点で固定し、後段の集計で
  // 「post_attempt 以外なのに outcome=success」のようなノイズを許さない。
  const normalizedOutcome = input.phase === 'post_attempt' ? (input.outcome ?? null) : null;

  return {
    userId: input.userId,
    phase: input.phase,
    timetableId: input.timetableId ?? null,
    classDate: input.classDate ?? null,
    method: input.method ?? null,
    outcome: normalizedOutcome,
    reason: input.reason ?? null,
    jobId: input.jobId ?? null,
    metadata: input.metadata ?? null,
  };
}
