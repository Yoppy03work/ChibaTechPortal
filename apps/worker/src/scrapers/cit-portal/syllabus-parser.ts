/**
 * CIT ポータル シラバス詳細 (Kmh006 の詳細ビュー) のパーサ。
 *
 * WHY: 詳細は PrimeFaces パネルの集合で、各項目は
 *   <div class="ui-widget-header">{ラベル}</div> ... <div class="ui-panel-content">{本文}</div>
 * の形。`.ui-widget-header` をラベル、同じ .ui-panel 内の .ui-panel-content を本文として
 * 全パネルを map 化し、既知ラベルを Syllabus 相当のフィールドへ寄せる。
 */
import { load } from 'cheerio';

export interface ParsedSyllabus {
  courseName: string | null;
  englishName: string | null;
  instructor: string | null;
  credits: string | null;
  /** 曜日時限 (例 "月曜6限、月曜7限") */
  dayPeriod: string | null;
  /** 開講学期コード (例 "5S") */
  semester: string | null;
  numbering: string | null;
  /** 授業の目的 + 到達目標 */
  objectives: string | null;
  /** 評価基準 + 試験割合 */
  evaluation: string | null;
  /** 教科書・参考書 */
  textbooks: string | null;
  /** 授業週 (1週..N週) を結合 */
  schedule: string | null;
  /** 全パネル (ラベル→本文)。将来のフィールド追加やデバッグ用。 */
  panels: Record<string, string>;
}

function panelMap(html: string): Record<string, string> {
  const $ = load(html);
  const map: Record<string, string> = {};
  $('.ui-widget-header').each((_, el) => {
    const label = $(el).clone().children().remove().end().text().replace(/\s+/g, ' ').trim();
    if (!label || label.length > 24) return;
    const $panel = $(el).closest('.ui-panel');
    let body = '';
    if ($panel.length) body = $panel.find('.ui-panel-content').first().text().replace(/\s+/g, ' ').trim();
    if (!body) body = $(el).next().text().replace(/\s+/g, ' ').trim();
    // 同名ラベルが複数 (事前学習内容 等) のときは最初の意味のあるものを優先しつつ上書きしない。
    if (map[label] === undefined) map[label] = body;
  });
  return map;
}

function joinNonEmpty(parts: Array<string | undefined>, sep = '\n\n'): string | null {
  const v = parts.map((p) => (p ?? '').trim()).filter(Boolean);
  return v.length ? v.join(sep) : null;
}

export function parseCitSyllabusDetail(html: string): ParsedSyllabus {
  const p = panelMap(html);
  const get = (k: string): string | undefined => (p[k] ? p[k] : undefined);

  // 授業週 (1週..N週) を順に結合
  const weekKeys = Object.keys(p)
    .filter((k) => /^\d+週$/.test(k))
    .sort((a, b) => parseInt(a) - parseInt(b));
  const schedule = weekKeys.length
    ? weekKeys.map((k) => `${k}: ${p[k]}`).join('\n')
    : null;

  // 評価: 評価基準 + 各試験割合
  const evalParts: string[] = [];
  if (get('評価基準')) evalParts.push(`評価基準: ${get('評価基準')}`);
  for (const k of ['期末試験％', '中間試験%', '小テスト% 回数', '提出物% 回数', 'プレゼン% 回数']) {
    if (get(k)) evalParts.push(`${k}: ${get(k)}`);
  }

  return {
    courseName: get('科目名') ?? null,
    englishName: get('英語名') ?? null,
    instructor: get('科目担当者') ?? get('担当教員') ?? null,
    credits: get('単位') ?? null,
    dayPeriod: get('曜日時限') ?? null,
    semester: get('開講学期') ?? null,
    numbering: get('科目ナンバー') ?? get('科目ナンバリング') ?? null,
    objectives: joinNonEmpty([get('授業の目的'), get('到達目標')]),
    evaluation: evalParts.length ? evalParts.join('\n') : null,
    textbooks: get('教科書・参考書') ?? get('教科書') ?? null,
    schedule,
    panels: p,
  };
}
