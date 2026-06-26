/**
 * runCitSyllabusSync / cleanCourseName のテスト。
 * - env ゲート fail-closed、履修 0 件 skip
 * - className 正規化、同名コマの集約と一括紐付け
 * - 1 科目の取得 null / 解析エラーの fail-soft、Syllabus の upsert(既存 update)
 * prisma は mock し、fetch/parse は deps 注入で差し替える。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const ttFindMany = vi.fn();
const ttUpdateMany = vi.fn();
const sylUpsert = vi.fn();
vi.mock('@chibatech/db', () => ({
  prisma: {
    timetable: {
      findMany: (...a: unknown[]) => ttFindMany(...a),
      updateMany: (...a: unknown[]) => ttUpdateMany(...a),
    },
    syllabus: {
      upsert: (...a: unknown[]) => sylUpsert(...a),
    },
  },
}));

import {
  runCitSyllabusSync,
  cleanCourseName,
  type CitSyllabusSyncDeps,
} from '../../src/services/cit-syllabus-sync';
import type { ParsedSyllabus } from '../../src/scrapers/cit-portal/syllabus-parser';

function parsed(courseName: string, over: Partial<ParsedSyllabus> = {}): ParsedSyllabus {
  return {
    courseName,
    englishName: null,
    instructor: '担当',
    credits: '2単位',
    dayPeriod: '月6',
    semester: '5S',
    academicYear: 2026,
    semesterTerm: '前期',
    numbering: '専8305',
    objectives: '目標',
    evaluation: '評価',
    textbooks: '教科書',
    schedule: '1週: x',
    panels: {},
    ...over,
  };
}

function enableSync() {
  process.env.SCRAPE_ENABLED = 'true';
  process.env.CIT_SYLLABUS_SYNC_ENABLED = 'true';
  process.env.CIT_PORTAL_USER_ID = 'u';
  process.env.CIT_PORTAL_PASSWORD = 'p';
  process.env.CIT_PORTAL_TOTP_SECRET = 'ABCDEF';
  process.env.CIT_PORTAL_SYNC_USER_ID = 'user-1';
}

beforeEach(() => {
  vi.clearAllMocks();
  ttFindMany.mockResolvedValue([]);
  ttUpdateMany.mockResolvedValue({ count: 0 });
  sylUpsert.mockResolvedValue({ id: 'syl-1' });
  enableSync();
});

describe('cleanCourseName', () => {
  it.each([
    ['オペレーティングシステム 情工3年 ※情報', 'オペレーティングシステム'],
    ['微分積分学Ⅰ 1年', '微分積分学Ⅰ'],
    ['英語ⅡA ※再履', '英語ⅡA'],
    ['プログラミング演習', 'プログラミング演習'],
    // 学年(1〜6年)以外の「年」を含む科目名は削りすぎない
    ['西暦2000年問題とその対策', '西暦2000年問題とその対策'],
    ['情報数学2 3年', '情報数学2'],
  ])('%s → %s', (input, expected) => {
    expect(cleanCourseName(input)).toBe(expected);
  });
});

describe('runCitSyllabusSync', () => {
  it('ゲート無効なら外部アクセスせず disabled', async () => {
    process.env.CIT_SYLLABUS_SYNC_ENABLED = 'false';
    const fetchSyllabi = vi.fn();
    const r = await runCitSyllabusSync({ fetchSyllabi });
    expect(r).toEqual({ ran: false, reason: 'disabled' });
    expect(fetchSyllabi).not.toHaveBeenCalled();
  });

  it('履修 0 件なら empty (fetch しない)', async () => {
    ttFindMany.mockResolvedValue([]);
    const fetchSyllabi = vi.fn();
    const r = await runCitSyllabusSync({ fetchSyllabi });
    expect(r).toEqual({ ran: false, reason: 'empty' });
    expect(fetchSyllabi).not.toHaveBeenCalled();
  });

  it('同名コマは 1 回だけ検索し、全コマに紐付ける', async () => {
    // OS が 6限/7限の 2 行 + 別科目 1 行
    ttFindMany.mockResolvedValue([
      { id: 't1', className: 'オペレーティングシステム 情工3年 ※情報' },
      { id: 't2', className: 'オペレーティングシステム 情工3年 ※情報' },
      { id: 't3', className: '線形代数 1年' },
    ]);
    const fetchSyllabi = vi.fn(async (_u, _p, _s, _d, names: string[]) =>
      names.map((courseName) => ({ courseName, html: `<html>${courseName}</html>` })),
    ) as unknown as CitSyllabusSyncDeps['fetchSyllabi'];
    const parse = vi.fn((html: string) =>
      parsed(html.includes('オペレ') ? 'オペレーティングシステム' : '線形代数'),
    );
    ttUpdateMany.mockResolvedValue({ count: 2 }).mockResolvedValueOnce({ count: 2 });

    const r = await runCitSyllabusSync({ fetchSyllabi, parse });

    // ユニーク 2 科目で検索
    const calledNames = (fetchSyllabi as unknown as ReturnType<typeof vi.fn>).mock.calls[0][4];
    expect(calledNames).toEqual(['オペレーティングシステム', '線形代数']);
    expect(r.ran).toBe(true);
    if (r.ran) {
      expect(r.courses).toBe(2);
      expect(r.synced).toBe(2);
    }
    // OS は updateMany で 2 行 (t1,t2) 紐付け
    expect(ttUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: ['t1', 't2'] } } }),
    );
  });

  it('取得 null / 解析エラーは skip して継続 (fail-soft)', async () => {
    ttFindMany.mockResolvedValue([
      { id: 't1', className: 'A 1年' },
      { id: 't2', className: 'B 1年' },
      { id: 't3', className: 'C 1年' },
    ]);
    const fetchSyllabi = (async () => [
      { courseName: 'A', html: '<a>' },
      { courseName: 'B', html: null }, // 取得失敗
      { courseName: 'C', html: '<c>' },
    ]) as unknown as CitSyllabusSyncDeps['fetchSyllabi'];
    const parse = vi.fn((html: string) => {
      if (html === '<c>') throw new Error('parse boom');
      return parsed('A');
    });
    const r = await runCitSyllabusSync({ fetchSyllabi, parse });
    expect(r.ran).toBe(true);
    if (r.ran) {
      expect(r.courses).toBe(3);
      expect(r.synced).toBe(1); // A のみ成功 (B=null, C=parse error)
    }
    expect(sylUpsert).toHaveBeenCalledTimes(1);
  });

  it('(academicYear, courseName) を自然キーに upsert する (重複行を作らない)', async () => {
    ttFindMany.mockResolvedValue([{ id: 't1', className: 'OS 3年' }]);
    const fetchSyllabi = (async () => [
      { courseName: 'OS', html: '<x>' },
    ]) as unknown as CitSyllabusSyncDeps['fetchSyllabi'];
    const parse = () => parsed('オペレーティングシステム', { academicYear: 2026 });
    await runCitSyllabusSync({ fetchSyllabi, parse });
    expect(sylUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          academicYear_courseName: {
            academicYear: 2026,
            courseName: 'オペレーティングシステム',
          },
        },
      }),
    );
  });
});
