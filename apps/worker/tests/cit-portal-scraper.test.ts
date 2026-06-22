/**
 * 移植した CIT ポータル SSO スクレイパ + 採用パーサの単体テスト。
 *
 * 純粋に検証できる部分:
 *   - generateTotpCode: BASE32 secret → 6 桁
 *   - parseTimetableHtml(timetable-parser): ヘッダ由来の曜日マッピングを pin
 *     (位置依存ではなく th.headerYobi から曜日を取ることを固定する回帰テスト)
 *
 * SSO+MFA のネットワークフロー (fetchCitPortalTimetableHtml) は実機 (TOTP secret) でのみ
 * 検証可能なため対象外 (scripts/verify-cit-sso.ts でカバー)。
 */
import { describe, expect, it } from 'vitest';
import { generateTotpCode } from '../src/scrapers/cit-portal/cit-portal-scraper';
import { parseTimetableHtml } from '../src/scrapers/timetable-parser';

describe('generateTotpCode', () => {
  it('BASE32 シークレットから 6 桁の数値文字列を生成する', () => {
    expect(generateTotpCode('JBSWY3DPEHPK3PXP')).toMatch(/^\d{6}$/);
  });
});

describe('parseTimetableHtml — 曜日はヘッダ由来 (位置依存にしない回帰)', () => {
  // WHY: アドバーサリアル検証が「曜日を固定カラム位置から導出すると、列順変更や
  // 日曜カラム追加で全授業が誤曜日化する」と指摘。ヘッダ (th.headerYobi) から曜日を
  // 引くことを、カラム順を意図的に「火・月・木」と並べ替えた fixture で固定する。
  const html = `
    <table class="classTable">
      <thead>
        <tr>
          <th></th>
          <th class="headerYobi">火曜日</th>
          <th class="headerYobi">月曜日</th>
          <th class="headerYobi">木曜日</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td class="colJigen">1</td>
          <td class="colYobi"><div class="jugyo-info"><div class="fontB">火の授業</div><span>７３１講義室</span></div></td>
          <td class="colYobi"><div class="jugyo-info noClass"></div></td>
          <td class="colYobi"><div class="jugyo-info"><div class="fontB">木の授業</div><span>オンライン</span></div></td>
        </tr>
        <tr>
          <td class="colJigen">2</td>
          <td class="colYobi"><div class="jugyo-info noClass"></div></td>
          <td class="colYobi"><div class="jugyo-info"><div class="fontB">月の授業</div><span>６１２講義室</span></div></td>
          <td class="colYobi"><div class="jugyo-info noClass"></div></td>
        </tr>
      </tbody>
    </table>`;

  it('並べ替えた列でも曜日がヘッダに従う (火=2/木=4/月=1)', () => {
    const entries = parseTimetableHtml(html);
    const byName = Object.fromEntries(entries.map((e) => [e.className, e]));
    expect(byName['火の授業']).toMatchObject({ dayOfWeek: 2, period: 1, room: '７３１講義室' });
    expect(byName['木の授業']).toMatchObject({ dayOfWeek: 4, period: 1, room: 'オンライン' });
    expect(byName['月の授業']).toMatchObject({ dayOfWeek: 1, period: 2, room: '６１２講義室' });
  });

  it('noClass セルは授業として拾わない', () => {
    const entries = parseTimetableHtml(html);
    expect(entries).toHaveLength(3);
  });
});
