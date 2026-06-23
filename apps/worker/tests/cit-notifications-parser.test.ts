/**
 * 掲示板お知らせパーサのテスト。
 *
 * WHY: tabArea にインラインの通知をタブ重複なく抽出し、externalId をタイトル安定ハッシュに、
 * 日付は題から best-effort 抽出することを固定する。実 fixture (.tmp, gitignore) があるときは
 * 件数 > 0 も確認 (CI では skip)。
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  parseCitPortalNotifications,
  parseDateFromTitle,
  categoryOfTitle,
} from '../src/scrapers/cit-portal/notifications-parser';

// tabArea にまたがる通知 (1つはタブ重複)。PrimeFaces.ab onclick を持つ。
const SAMPLE = `
<div id="funcForm:tabArea:0:p">
  <a id="funcForm:tabArea:0:r:0:j_idt289" onclick="PrimeFaces.ab({s:'a'});return false;">6月20日 物理の世界 休講のお知らせ</a>
  <a id="funcForm:tabArea:0:r:1:j_idt289" onclick="PrimeFaces.ab({s:'b'});return false;">【数学科教育法３】教室変更のお知らせ</a>
  <a id="funcForm:tabArea:0:r:2:j_idt289" onclick="PrimeFaces.ab({s:'c'});return false;">見る</a>
</div>
<div id="funcForm:tabArea:1:p">
  <a id="funcForm:tabArea:1:r:0:j_idt372" onclick="PrimeFaces.ab({s:'a'});return false;">6月20日 物理の世界 休講のお知らせ</a>
  <a id="funcForm:tabArea:1:r:1:j_idt372" onclick="PrimeFaces.ab({s:'d'});return false;">台風6号の影響による臨時休講の補講日について</a>
</div>`;

describe('parseDateFromTitle', () => {
  const now = new Date('2026-06-23T12:00:00+09:00');
  it('"6月20日" を JST の日付として解釈する', () => {
    const d = parseDateFromTitle('6月20日 休講', now);
    // JST 6/20 00:00 = UTC 6/19 15:00
    expect(d?.toISOString()).toBe('2026-06-19T15:00:00.000Z');
  });
  it('"5/8" 形式も解釈する', () => {
    expect(parseDateFromTitle('5/8 感性情報処理 休講', now)?.toISOString()).toBe(
      '2026-05-07T15:00:00.000Z'
    );
  });
  it('日付が無ければ null', () => {
    expect(parseDateFromTitle('台風6号の影響による補講', now)).toBeNull();
  });
});

describe('categoryOfTitle', () => {
  it('キーワードでカテゴリ判定 (優先順)', () => {
    expect(categoryOfTitle('【数学】教室変更のお知らせ')).toBe('教室変更');
    expect(categoryOfTitle('物理 休講のお知らせ')).toBe('休講');
    expect(categoryOfTitle('受講申込について')).toBe('その他');
  });
});

describe('parseCitPortalNotifications', () => {
  const now = new Date('2026-06-23T12:00:00+09:00');

  it('タブ重複を除き、短いラベルを除外して通知を抽出する', () => {
    const items = parseCitPortalNotifications(SAMPLE, { now });
    const titles = items.map((i) => i.title);
    expect(titles).toContain('6月20日 物理の世界 休講のお知らせ');
    expect(titles).toContain('【数学科教育法３】教室変更のお知らせ');
    expect(titles).toContain('台風6号の影響による臨時休講の補講日について');
    expect(titles).not.toContain('見る'); // 短いラベルは除外
    // タブ重複した "6月20日..." は1件だけ
    expect(titles.filter((t) => t === '6月20日 物理の世界 休講のお知らせ')).toHaveLength(1);
    expect(items).toHaveLength(3);
  });

  it('externalId はタイトル安定ハッシュで一意', () => {
    const items = parseCitPortalNotifications(SAMPLE, { now });
    const ids = items.map((i) => i.externalId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => id.startsWith('cit-keiji-'))).toBe(true);
    // 同入力で同 externalId (決定的)
    const again = parseCitPortalNotifications(SAMPLE, { now });
    expect(again.map((i) => i.externalId)).toEqual(ids);
  });

  it('題に日付があれば publishedAt に反映、無ければ now フォールバック', () => {
    const items = parseCitPortalNotifications(SAMPLE, { now });
    const dated = items.find((i) => i.title.startsWith('6月20日'))!;
    expect(dated.publishedAt.toISOString()).toBe('2026-06-19T15:00:00.000Z');
    const undated = items.find((i) => i.title.startsWith('台風'))!;
    expect(undated.publishedAt.getTime()).toBe(now.getTime());
  });
});

describe('parseCitPortalNotifications (実 fixture, あるときだけ)', () => {
  const p = resolve(process.cwd(), '.tmp/keiji.html');
  const it2 = existsSync(p) ? it : it.skip;
  it2('実掲示板から複数のお知らせを抽出する', () => {
    const items = parseCitPortalNotifications(readFileSync(p, 'utf8'), {
      now: new Date('2026-06-23T12:00:00+09:00'),
    });
    expect(items.length).toBeGreaterThan(5);
    expect(new Set(items.map((i) => i.externalId)).size).toBe(items.length);
  });
});
