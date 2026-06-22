/**
 * 移植した CIT ポータル SSO スクレイパの単体テスト。
 *
 * 純粋に検証できる部分のみ:
 *   - generateTotpCode: BASE32 secret → 6 桁
 *   - parseTimetableHtml: 実 fixture (gitignore 配下) があるときだけ
 *   - citPortalClassToScrapedEntries: 連続コマ展開 + フィールドマッピング
 *
 * SSO+MFA のネットワークフロー (login) は実機 (TOTP secret) でのみ検証可能なため
 * ここでは対象外 (verify スクリプトでカバー)。
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  generateTotpCode,
  parseTimetableHtml,
  type CitPortalClass,
} from '../src/scrapers/cit-portal/cit-portal-scraper';
import { citPortalClassToScrapedEntries } from '../src/scrapers/cit-portal/to-scraped-entry';

const SAMPLE_PATH = resolve(process.cwd(), '.tmp/cit-timetable-sample.html');

describe('generateTotpCode', () => {
  it('BASE32 シークレットから 6 桁の数値文字列を生成する', () => {
    // RFC 6238 系のテストベクタ secret
    expect(generateTotpCode('JBSWY3DPEHPK3PXP')).toMatch(/^\d{6}$/);
  });
});

describe('parseTimetableHtml (実 fixture, あるときだけ)', () => {
  // .tmp/ は gitignore。実スケジュールを含むため CI には置かない → 不在時 skip。
  const it2 = existsSync(SAMPLE_PATH) ? it : it.skip;

  it2('時間割サンプルから授業を抽出し dayOfWeek が月=1..土=6 に収まる', () => {
    const classes = parseTimetableHtml(readFileSync(SAMPLE_PATH, 'utf8'));
    expect(classes.length).toBeGreaterThan(0);
    for (const c of classes) {
      expect(c.dayOfWeek).toBeGreaterThanOrEqual(1);
      expect(c.dayOfWeek).toBeLessThanOrEqual(6);
      expect(typeof c.courseName).toBe('string');
      expect(c.courseName.length).toBeGreaterThan(0);
    }
  });

  it2('連続コマがマージされ endPeriod が period 以上になる', () => {
    const classes = parseTimetableHtml(readFileSync(SAMPLE_PATH, 'utf8'));
    for (const c of classes) {
      expect(c.endPeriod).toBeGreaterThanOrEqual(c.period);
    }
  });
});

describe('citPortalClassToScrapedEntries', () => {
  const base: CitPortalClass = {
    dayOfWeek: 1,
    period: 2,
    endPeriod: 2,
    startTime: '10:00',
    endTime: '11:00',
    courseName: '線形代数',
    classroom: '７３１講義室',
    teacher: '千葉太郎',
    effectiveFrom: null,
    effectiveTo: null,
  };

  it('単発コマは 1 行にマップされ、room/className が移る', () => {
    const out = citPortalClassToScrapedEntries([base]);
    expect(out).toEqual([
      { dayOfWeek: 1, period: 2, className: '線形代数', room: '７３１講義室', classId: null },
    ]);
  });

  it('連続コマ (2-4限) は per-period の 3 行に展開される', () => {
    const out = citPortalClassToScrapedEntries([{ ...base, period: 2, endPeriod: 4 }]);
    expect(out.map((e) => e.period)).toEqual([2, 3, 4]);
    expect(new Set(out.map((e) => e.className))).toEqual(new Set(['線形代数']));
    expect(new Set(out.map((e) => e.room))).toEqual(new Set(['７３１講義室']));
  });

  it('classroom が null の場合 room=null', () => {
    const out = citPortalClassToScrapedEntries([{ ...base, classroom: null }]);
    expect(out[0].room).toBeNull();
  });

  it('endPeriod が不正 (< period) でも最低 1 行は出す', () => {
    const out = citPortalClassToScrapedEntries([{ ...base, period: 3, endPeriod: 1 }]);
    expect(out).toHaveLength(1);
    expect(out[0].period).toBe(3);
  });
});
