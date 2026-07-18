import { describe, it, expect } from 'vitest';
import { blockRowIds, type ClassPeriodRow } from '../src/lib/attendance-blocks';

const rows: ClassPeriodRow[] = [
  { id: 'a1', className: '情報理論', period: 1 },
  { id: 'a2', className: '情報理論', period: 2 },
  { id: 'b3', className: '電気回路', period: 3 },
  { id: 'b4', className: '電気回路', period: 4 },
  { id: 'b5', className: '電気回路', period: 5 },
  // 補講: 同名だが非連続 → 別ブロック
  { id: 'a7', className: '情報理論', period: 7 },
  { id: 'a8', className: '情報理論', period: 8 },
];

describe('blockRowIds', () => {
  it('連続コマの同名授業は同じブロックになる（先頭・末尾どちらから引いても同じ）', () => {
    expect(blockRowIds(rows, 'a1')).toEqual(['a1', 'a2']);
    expect(blockRowIds(rows, 'a2')).toEqual(['a1', 'a2']);
    expect(blockRowIds(rows, 'b4')).toEqual(['b3', 'b4', 'b5']);
  });

  it('補講（同じ日の非連続の同名授業）は別ブロックになる', () => {
    expect(blockRowIds(rows, 'a7')).toEqual(['a7', 'a8']);
    expect(blockRowIds(rows, 'a8')).toEqual(['a7', 'a8']);
    // 1-2限のブロックに 7-8限は含まれない
    expect(blockRowIds(rows, 'a1')).not.toContain('a7');
  });

  it('別名の授業はブロックを共有しない', () => {
    expect(blockRowIds(rows, 'b3')).not.toContain('a2');
  });

  it('rows に無い行IDは安全側でその行のみを返す', () => {
    expect(blockRowIds(rows, 'unknown')).toEqual(['unknown']);
    expect(blockRowIds([], 'x')).toEqual(['x']);
  });

  it('単独コマは自分だけのブロック', () => {
    const single: ClassPeriodRow[] = [{ id: 's1', className: '体育', period: 3 }];
    expect(blockRowIds(single, 's1')).toEqual(['s1']);
  });
});
