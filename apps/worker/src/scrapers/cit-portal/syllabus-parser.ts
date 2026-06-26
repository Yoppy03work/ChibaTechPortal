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
  /** 開講年度 (例 2026)。詳細の「開講年度学期」由来。取れなければ null。 */
  academicYear: number | null;
  /** 正規化した学期 '前期' | '後期' | '通年'。取れなければ null。 */
  semesterTerm: '前期' | '後期' | '通年' | null;
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

/**
 * 詳細から開講年度学期を拾う。例 "2026年度前期" → { academicYear: 2026, semesterTerm: '前期' }。
 *
 * WHY: 値は「開講年度学期」ラベルの隣ではなく「週間授業」見出し付近に
 * [YYYY年度学期] として描画される(実機確認)。一方、備考や入学年度など過去年度の
 * 参照が前方に混ざり得るため、全文の先頭一致では誤年度を拾う。対策:
 *   - 「YYYY年度<学期>」が 1 件だけならそれを採用(実シラバスの通常ケース)。
 *   - 複数あるときは「週間授業」見出し直後の窓に出るものを優先する。
 * bare な「YYYY年度」だけの一致は採らない(入学年度/カリキュラム年度の混入を防ぐ。
 * 取れなければ null → 呼び出し側が現在の年度/学期で補完する)。
 */
function extractTermInfo(html: string): {
  academicYear: number | null;
  semesterTerm: '前期' | '後期' | '通年' | null;
} {
  const text = load(html).root().text().replace(/\s+/g, '');
  const all = [...text.matchAll(/(\d{4})年度(前期|後期|通年|前学期|後学期)/g)];
  if (all.length === 0) return { academicYear: null, semesterTerm: null };

  let m = all[0];
  if (all.length > 1) {
    const anchor = text.indexOf('週間授業');
    const near =
      anchor >= 0
        ? all.find((x) => x.index! >= anchor && x.index! < anchor + 80)
        : undefined;
    m = near ?? all[0];
  }
  const raw = m[2];
  const term: '前期' | '後期' | '通年' =
    raw === '前学期' ? '前期' : raw === '後学期' ? '後期' : (raw as '前期' | '後期' | '通年');
  return { academicYear: Number(m[1]), semesterTerm: term };
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
  const term = extractTermInfo(html);

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
    academicYear: term.academicYear,
    semesterTerm: term.semesterTerm,
    numbering: get('科目ナンバー') ?? get('科目ナンバリング') ?? null,
    objectives: joinNonEmpty([get('授業の目的'), get('到達目標')]),
    evaluation: evalParts.length ? evalParts.join('\n') : null,
    textbooks: get('教科書・参考書') ?? get('教科書') ?? null,
    schedule,
    panels: p,
  };
}
