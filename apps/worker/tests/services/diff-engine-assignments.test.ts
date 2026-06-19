/**
 * diffAndSaveAssignments のテスト
 *
 * WHY: manaba 課題の externalId 差分保存。既存は除外し新着のみ createMany、
 * title/courseName はサニタイズすることを固定する。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const assignmentFindMany = vi.fn();
const assignmentCreateMany = vi.fn();
vi.mock('@chibatech/db', () => ({
  prisma: {
    assignment: {
      findMany: (...a: unknown[]) => assignmentFindMany(...a),
      createMany: (...a: unknown[]) => assignmentCreateMany(...a),
    },
  },
}));

import { diffAndSaveAssignments } from '../../src/services/diff-engine';

function asg(externalId: string, title = 'T', courseName = 'C') {
  return { externalId, title, courseName, dueDate: null, url: 'https://manaba/x' };
}

beforeEach(() => {
  vi.clearAllMocks();
  assignmentFindMany.mockReset();
  assignmentCreateMany.mockReset();
  assignmentFindMany.mockResolvedValue([]);
  assignmentCreateMany.mockResolvedValue({ count: 0 });
});

describe('diffAndSaveAssignments', () => {
  it('空配列は何も保存しない', async () => {
    const r = await diffAndSaveAssignments('u1', []);
    expect(r).toEqual([]);
    expect(assignmentFindMany).not.toHaveBeenCalled();
    expect(assignmentCreateMany).not.toHaveBeenCalled();
  });

  it('既存 externalId は除外し新着のみ createMany する', async () => {
    assignmentFindMany.mockResolvedValue([{ externalId: 'a1' }]);
    const r = await diffAndSaveAssignments('u1', [asg('a1'), asg('a2'), asg('a3')]);

    expect(r.map((a) => a.externalId)).toEqual(['a2', 'a3']);
    expect(assignmentCreateMany).toHaveBeenCalledTimes(1);
    const data = (
      assignmentCreateMany.mock.calls[0][0] as {
        data: Array<{ externalId: string; userId: string }>;
      }
    ).data;
    expect(data.map((d) => d.externalId)).toEqual(['a2', 'a3']);
    expect(data.every((d) => d.userId === 'u1')).toBe(true);
  });

  it('全て既存なら createMany しない', async () => {
    assignmentFindMany.mockResolvedValue([{ externalId: 'a1' }]);
    const r = await diffAndSaveAssignments('u1', [asg('a1')]);
    expect(r).toEqual([]);
    expect(assignmentCreateMany).not.toHaveBeenCalled();
  });

  it('title をサニタイズする (script を除去)', async () => {
    await diffAndSaveAssignments('u1', [asg('a1', '<script>alert(1)</script>レポート')]);
    const data = (
      assignmentCreateMany.mock.calls[0][0] as { data: Array<{ title: string }> }
    ).data;
    expect(data[0].title).not.toContain('<script');
  });
});
