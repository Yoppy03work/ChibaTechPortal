/**
 * UNIPA シラバスページ (Kmh006 系: Kmh00601.xhtml 検索 / Kmh00604.xhtml 詳細) の HTML パーサ
 *
 * WHY: timetable-parser.ts と同じ流儀で「取得 (fetch) と解析 (parse) を分離」する。
 * 本ファイルは解析専用 (純粋関数) で、実 HTML 構造に対して単体テスト可能にする。
 * fetch / JSF ViewState 管理 / 検索 POST は CIT Portal アダプタ側 (cit-portal-http.ts もしくは
 * 既存 syllabus-scraper.ts のリファクタ後) の責務とし、ここには HTTP を持ち込まない。
 *
 * 状態: SCAFFOLD。下記セレクタは「想定」であり未確定。実 HTML 採取後
 * (docs/captures/syllabus-capture.md の手順で .tmp/syllabus-*.html を採取) に
 * SELECTORS / ラベル対応表を実構造へ差し替えて確定させる。差し替え時は
 * apps/worker/tests/scrapers/syllabus-parser.test.ts の FIXTURE を実 HTML の最小断片へ更新する。
 *
 * 出力 (ScrapedSyllabus) は packages/db Syllabus モデルへほぼ 1:1 でマップできる形に揃える:
 *   academicYear, semester, courseName, courseCode, instructor, department, campus,
 *   dayOfWeek, period, category, objectives, schedule, evaluation, textbooks, originalUrl
 * (academicYear / originalUrl は採取時のコンテキストから fetch 側で補完する想定なので任意)
 */
import { load } from 'cheerio';
import type { CheerioAPI } from 'cheerio';

/**
 * シラバス検索結果の 1 行 (一覧ページ Kmh00601 の結果テーブル)。
 * 詳細ページへ遷移するための識別子 (リンク/JSFの行キー) を含む。
 */
export interface ScrapedSyllabusListItem {
  courseName: string;
  instructor: string | null;
  /** 学部/学科 (列にあれば) */
  department: string | null;
  /** 開講期 (前期/後期/通年 等、列にあれば) */
  semester: string | null;
  /**
   * 詳細ページへ辿るためのキー。実 HTML 確定後に確定:
   *   - 通常リンクなら href、JSF の onclick なら data-rk / 行 index 等。
   * fetch 側はこれを使って詳細 POST/GET を組み立てる。
   */
  detailKey: string | null;
}

/**
 * シラバス詳細 (詳細ページ Kmh00604 等)。Syllabus モデルへマップする形。
 * WHY: 値が取れない欄は null。空文字ではなく null に正規化する (DB は nullable)。
 */
export interface ScrapedSyllabus {
  courseName: string;
  courseCode: string | null;
  instructor: string | null;
  department: string | null;
  campus: string | null;
  /** '前期' | '後期' | '通年' 等。表記は実 HTML 準拠 */
  semester: string | null;
  /** 曜日 (例 '月')。実 HTML が '月曜日' 等なら正規化方針を採取後に決める */
  dayOfWeek: string | null;
  /** 時限 (例 '1' / '1-2') */
  period: string | null;
  /** 科目区分 (必修/選択 等) */
  category: string | null;
  objectives: string | null;
  schedule: string | null;
  evaluation: string | null;
  textbooks: string | null;
}

/**
 * 詳細ページのラベル → 出力フィールドの対応表。
 * WHY: UNIPA シラバスは「項目名セル + 値セル」の dl/table 構造が多い。実ラベル文言は
 * 採取後に確定する。ここは想定値なので、実 HTML のラベル文言に合わせて差し替える。
 * キーは「ラベルに含まれる部分文字列」(完全一致でなく includes 判定) を想定。
 */
const DETAIL_LABEL_MAP: Record<string, keyof ScrapedSyllabus> = {
  // TODO(実HTML): 下記は仮。採取した詳細ページのラベル文言に合わせて確定する。
  科目名: 'courseName',
  科目コード: 'courseCode',
  担当: 'instructor', // '担当教員' 等
  学科: 'department', // '開講学科' 等
  キャンパス: 'campus',
  学期: 'semester', // '開講期' 等
  曜日: 'dayOfWeek',
  時限: 'period',
  区分: 'category', // '科目区分' 等
  到達目標: 'objectives', // '授業の目的' '到達目標' 等
  授業計画: 'schedule', // '授業スケジュール' 等
  成績評価: 'evaluation', // '評価方法' 等
  教科書: 'textbooks', // '教科書・参考書' 等
};

/** 取得テキストを正規化 (前後空白/全角空白/連続空白を畳む)。空なら null。 */
function normalizeText(raw: string | undefined | null): string | null {
  if (raw == null) return null;
  const t = raw.replace(/　/g, ' ').replace(/\s+/g, ' ').trim();
  return t.length > 0 ? t : null;
}

/**
 * シラバス「検索結果一覧」HTML をパースする。
 *
 * WHY: timetable-parser と同じく、テーブルを起点に行を抽出する純粋関数。
 * 状態: SELECTORS は想定。採取後に table セレクタ / 列順 / detailKey 抽出を確定する。
 */
export function parseSyllabusListHtml(html: string): ScrapedSyllabusListItem[] {
  const $: CheerioAPI = load(html);

  // TODO(実HTML): 結果テーブルのセレクタを採取後に確定する。
  // 候補: JSF dataTable は id に "srchResultList" 等を含み、class に "ui-datatable" を持つことが多い。
  const table = $('table[id*="srchResult"], table.ui-datatable-data, table.syllabus-list').first();
  if (table.length === 0) return [];

  const items: ScrapedSyllabusListItem[] = [];
  table.find('tbody > tr').each((_, tr) => {
    const $tr = $(tr);
    const cells = $tr.find('td');
    // TODO(実HTML): 列順は採取後に確定。ここでは「科目名 / 担当 / 学科 / 学期」を仮置き。
    if (cells.length === 0) return;

    const courseName = normalizeText($(cells[0]).text());
    if (!courseName) return; // 見出し/空行を除外

    // detailKey: リンク href か JSF 行キー。採取後にどちらか確定する。
    const $link = $(cells[0]).find('a').first();
    const detailKey =
      $link.attr('href') ??
      $link.attr('data-rk') ?? // PrimeFaces row key の一例
      $tr.attr('data-rk') ??
      null;

    items.push({
      courseName,
      instructor: cells.length > 1 ? normalizeText($(cells[1]).text()) : null,
      department: cells.length > 2 ? normalizeText($(cells[2]).text()) : null,
      semester: cells.length > 3 ? normalizeText($(cells[3]).text()) : null,
      detailKey,
    });
  });

  return items;
}

/**
 * シラバス「詳細」HTML をパースする。
 *
 * WHY: 詳細ページは「ラベルセル + 値セル」の対が並ぶ構造を想定。DETAIL_LABEL_MAP で
 * ラベル文言 → フィールドへ振り分ける。採取後に行構造 (th/td か dt/dd か) を確定する。
 *
 * @returns courseName が取れなければ null (詳細として無効)
 */
export function parseSyllabusDetailHtml(html: string): ScrapedSyllabus | null {
  const $: CheerioAPI = load(html);

  const result: ScrapedSyllabus = {
    courseName: '',
    courseCode: null,
    instructor: null,
    department: null,
    campus: null,
    semester: null,
    dayOfWeek: null,
    period: null,
    category: null,
    objectives: null,
    schedule: null,
    evaluation: null,
    textbooks: null,
  };

  // TODO(実HTML): 行コンテナのセレクタを採取後に確定する。
  // 想定: <tr><th>ラベル</th><td>値</td></tr> もしくは <dt>ラベル</dt><dd>値</dd>。
  $('table tr, dl > div').each((_, row) => {
    const $row = $(row);
    const label = normalizeText(
      $row.find('th').first().text() || $row.find('dt').first().text()
    );
    const value = normalizeText(
      $row.find('td').first().text() || $row.find('dd').first().text()
    );
    if (!label) return;

    for (const [needle, field] of Object.entries(DETAIL_LABEL_MAP)) {
      if (label.includes(needle)) {
        // courseName は空文字初期値なので value が null でも上書きしない
        if (field === 'courseName') {
          if (value) result.courseName = value;
        } else {
          (result[field] as string | null) = value;
        }
        break;
      }
    }
  });

  if (!result.courseName) return null;
  return result;
}
