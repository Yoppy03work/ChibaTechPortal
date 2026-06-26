/**
 * シラバス詳細パーサのテスト。
 * PrimeFaces パネル (.ui-widget-header ラベル → .ui-panel-content 本文) からの抽出と、
 * 授業週の結合・評価割合の集約を固定する。実 fixture (.tmp, gitignore) があれば追加検証。
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseCitSyllabusDetail } from '../src/scrapers/cit-portal/syllabus-parser';

function panel(label: string, body: string): string {
  return `<div class="ui-panel"><div class="ui-panel-titlebar ui-widget-header">${label}</div><div class="ui-panel-content">${body}</div></div>`;
}
const SAMPLE = `<div>
  <table><tr><th>開講年度学期</th><td>2026年度前期</td></tr></table>
  ${panel('科目名', 'オペレーティングシステム')}
  ${panel('英語名', 'Operating Systems')}
  ${panel('科目担当者', '前川 仁孝')}
  ${panel('単位', '2単位')}
  ${panel('曜日時限', '月曜6限、月曜7限')}
  ${panel('開講学期', '5S')}
  ${panel('科目ナンバー', '専8305')}
  ${panel('授業の目的', '目的テキスト')}
  ${panel('到達目標', '到達目標テキスト')}
  ${panel('評価基準', '基準テキスト')}
  ${panel('期末試験％', '45')}
  ${panel('中間試験%', '45')}
  ${panel('教科書・参考書', '参考書：OSの仕組み／朝倉書店')}
  ${panel('1週', '初回ガイダンス')}
  ${panel('2週', '歴史')}
  ${panel('3週', 'モジュール')}
</div>`;

describe('parseCitSyllabusDetail', () => {
  const s = parseCitSyllabusDetail(SAMPLE);

  it('基本メタを抽出する', () => {
    expect(s.courseName).toBe('オペレーティングシステム');
    expect(s.englishName).toBe('Operating Systems');
    expect(s.instructor).toBe('前川 仁孝');
    expect(s.credits).toBe('2単位');
    expect(s.dayPeriod).toBe('月曜6限、月曜7限');
    expect(s.semester).toBe('5S');
    expect(s.numbering).toBe('専8305');
  });

  it('開講年度学期から academicYear/semesterTerm を取り出す', () => {
    expect(s.academicYear).toBe(2026);
    expect(s.semesterTerm).toBe('前期');
  });

  it('複数年度が混在しても「週間授業」見出し付近の開講年度を優先する', () => {
    // 備考に過去年度の参照、開講年度は週間授業見出しに出る実機構造を模す
    const html = `<div>
      ${panel('注意事項', '2020年度後期に開講した内容を踏襲する。')}
      <h3>週間授業 2026年度前期</h3>
      ${panel('1週', 'x')}
    </div>`;
    const r = parseCitSyllabusDetail(html);
    expect(r.academicYear).toBe(2026);
    expect(r.semesterTerm).toBe('前期');
  });

  it('YYYY年度<学期> が無ければ academicYear/semesterTerm は null (呼び出し側で補完)', () => {
    const r = parseCitSyllabusDetail(`<div>${panel('科目名', 'X')}</div>`);
    expect(r.academicYear).toBeNull();
    expect(r.semesterTerm).toBeNull();
  });

  it('授業の目的 + 到達目標 を objectives に結合する', () => {
    expect(s.objectives).toContain('目的テキスト');
    expect(s.objectives).toContain('到達目標テキスト');
  });

  it('評価基準 + 試験割合 を evaluation に集約する', () => {
    expect(s.evaluation).toContain('基準テキスト');
    expect(s.evaluation).toContain('期末試験％: 45');
    expect(s.evaluation).toContain('中間試験%: 45');
  });

  it('教科書・参考書 を textbooks に', () => {
    expect(s.textbooks).toBe('参考書：OSの仕組み／朝倉書店');
  });

  it('授業週を順に schedule へ結合する', () => {
    expect(s.schedule).toContain('1週: 初回ガイダンス');
    expect(s.schedule).toContain('3週: モジュール');
    // 1週→2週→3週 の順
    expect(s.schedule!.indexOf('1週')).toBeLessThan(s.schedule!.indexOf('2週'));
  });
});

describe('parseCitSyllabusDetail (実 fixture, あるときだけ)', () => {
  const p = resolve(process.cwd(), '.tmp/syllabus-detail.html');
  const it2 = existsSync(p) ? it : it.skip;
  it2('実シラバス詳細から主要項目を抽出する', () => {
    const s = parseCitSyllabusDetail(readFileSync(p, 'utf8'));
    expect(s.courseName).toBeTruthy();
    expect(s.instructor).toBeTruthy();
    expect((s.objectives ?? '').length).toBeGreaterThan(20);
    expect((s.schedule ?? '').length).toBeGreaterThan(20);
  });
});
