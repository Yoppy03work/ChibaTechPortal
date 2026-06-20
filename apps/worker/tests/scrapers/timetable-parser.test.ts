/**
 * parseTimetableHtml のテスト
 *
 * WHY: UNIPA 時間割 (Kmd00801.xhtml) の HTML 構造から各コマを抽出する。実ページの
 * classTable 構造 (thead=曜日, tbody tr=時限, jugyo-info/fontB/span) を fixture で固定する。
 */
import { describe, it, expect } from 'vitest';
import { parseTimetableHtml } from '../../src/scrapers/timetable-parser';

const FIXTURE = `
<table class="table table-bordered classTable">
  <thead><tr>
    <th class="ui-widget-header headerJigen"></th>
    <th class="ui-widget-header headerYobi">月曜日</th>
    <th class="ui-widget-header headerYobi">火曜日</th>
  </tr></thead>
  <tbody>
    <tr>
      <td class="colJigen ui-widget-header">1</td>
      <td class="colYobi"><div class="jugyo-info jugyo-normal noClass"></div></td>
      <td class="colYobi"><div class="jugyo-info jugyo-normal">
        <div class="fontB">キャリアデザイン３ 情工</div>
        <div class="">須田　宇宙</div>
        <div class=""><span>７３１講義室</span>／<span>津田沼キャンパス</span></div>
        <div class="taniSu">1単位</div>
      </div></td>
    </tr>
    <tr>
      <td class="colJigen ui-widget-header">2</td>
      <td class="colYobi"><div class="jugyo-info jugyo-normal">
        <div class="fontB">月曜2限の授業</div>
        <div class=""><span>オンライン</span></div>
      </div></td>
      <td class="colYobi"><div class="jugyo-info jugyo-normal noClass"></div></td>
    </tr>
  </tbody>
</table>`;

describe('parseTimetableHtml', () => {
  it('classTable から授業セルを抽出する (曜日・時限・授業名・教室)', () => {
    const entries = parseTimetableHtml(FIXTURE);
    expect(entries).toEqual([
      {
        dayOfWeek: 2, // 火
        period: 1,
        className: 'キャリアデザイン３ 情工',
        room: '７３１講義室',
        classId: null,
      },
      {
        dayOfWeek: 1, // 月
        period: 2,
        className: '月曜2限の授業',
        room: 'オンライン',
        classId: null,
      },
    ]);
  });

  it('noClass の空きコマは抽出しない', () => {
    const entries = parseTimetableHtml(FIXTURE);
    // 月1 と 火2 は noClass なので含まれない
    expect(entries.find((e) => e.dayOfWeek === 1 && e.period === 1)).toBeUndefined();
    expect(entries.find((e) => e.dayOfWeek === 2 && e.period === 2)).toBeUndefined();
  });

  it('classTable が無ければ空配列', () => {
    expect(parseTimetableHtml('<html><body>no table</body></html>')).toEqual([]);
  });
});
