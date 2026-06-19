/**
 * syncTimetable のテスト
 *
 * WHY: 時間割スクレイピング同期がユーザーの手動編集 (source='manual') を保護し、
 * scrape 由来 (source='scraped') だけを create/update/delete することを固定する。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const ttFindMany = vi.fn();
const ttCreate = vi.fn();
const ttUpdate = vi.fn();
const ttDelete = vi.fn();
vi.mock('@chibatech/db', () => ({
  prisma: {
    timetable: {
      findMany: (...a: unknown[]) => ttFindMany(...a),
      create: (...a: unknown[]) => ttCreate(...a),
      update: (...a: unknown[]) => ttUpdate(...a),
      delete: (...a: unknown[]) => ttDelete(...a),
    },
  },
}));

import { syncTimetable } from '../../src/services/timetable-sync';

function entry(dayOfWeek: number, period: number, className = 'C', room: string | null = '8109') {
  return { dayOfWeek, period, className, room, classId: null };
}

beforeEach(() => {
  vi.clearAllMocks();
  ttFindMany.mockReset();
  ttCreate.mockResolvedValue({});
  ttUpdate.mockResolvedValue({});
  ttDelete.mockResolvedValue({});
});

describe('syncTimetable', () => {
  it('既存なしなら全て create (source=scraped)', async () => {
    ttFindMany.mockResolvedValue([]);
    const r = await syncTimetable('u1', [entry(1, 1), entry(1, 2)]);
    expect(r.created).toBe(2);
    expect(ttCreate).toHaveBeenCalledTimes(2);
    expect((ttCreate.mock.calls[0][0] as { data: { source: string } }).data.source).toBe(
      'scraped'
    );
  });

  it('既存 scraped 行は update する', async () => {
    ttFindMany.mockResolvedValue([
      { id: 't1', dayOfWeek: 1, period: 1, source: 'scraped' },
    ]);
    const r = await syncTimetable('u1', [entry(1, 1, '新しい授業')]);
    expect(r.updated).toBe(1);
    expect(ttCreate).not.toHaveBeenCalled();
    expect(ttUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 't1' } })
    );
  });

  it('既存 manual 行は保護し上書きしない', async () => {
    ttFindMany.mockResolvedValue([
      { id: 't1', dayOfWeek: 1, period: 1, source: 'manual' },
    ]);
    const r = await syncTimetable('u1', [entry(1, 1, 'scrape結果')]);
    expect(r.skippedManual).toBe(1);
    expect(r.updated).toBe(0);
    expect(ttUpdate).not.toHaveBeenCalled();
    expect(ttDelete).not.toHaveBeenCalled();
  });

  it('scrape から消えた scraped 行は削除する', async () => {
    ttFindMany.mockResolvedValue([
      { id: 't1', dayOfWeek: 1, period: 1, source: 'scraped' },
    ]);
    const r = await syncTimetable('u1', []); // 何も無くなった
    expect(r.removed).toBe(1);
    expect(ttDelete).toHaveBeenCalledWith({ where: { id: 't1' } });
  });

  it('scrape から消えても manual 行は削除しない', async () => {
    ttFindMany.mockResolvedValue([
      { id: 't1', dayOfWeek: 1, period: 1, source: 'manual' },
    ]);
    const r = await syncTimetable('u1', []);
    expect(r.removed).toBe(0);
    expect(ttDelete).not.toHaveBeenCalled();
  });
});
