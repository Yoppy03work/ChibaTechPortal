/**
 * シラバススクレイパー
 *
 * WHY: CIT Portalのシラバス検索はゲストログインで認証不要。
 * JSFベースだがViewState管理でHTTPアクセス可能。
 * 時間割登録時に科目名+曜日+時限でシラバスを検索・紐付けする。
 */
import { ScraperError } from '@chibatech/shared';

const SYLLABUS_URL = 'https://portal.it-chiba.ac.jp/uprx/up/km/kmh006/Kmh00601.xhtml?guestlogin=Kmh006';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

export interface SyllabusData {
  courseName: string;
  courseCode: string | null;
  instructor: string;
  department: string;
  campus: string;
  semester: string;
  dayOfWeek: string | null;
  period: string | null;
  objectives: string | null;
  schedule: string | null;
  evaluation: string | null;
  textbooks: string | null;
  originalUrl: string;
}

/**
 * シラバスをゲストログインで検索する
 *
 * WHY: ゲストログインURLにアクセスするだけで認証不要。
 * 学期始めに1回取得してDBにキャッシュし、以降はDBから読み出す。
 */
export async function searchSyllabus(courseName: string): Promise<SyllabusData[]> {
  try {
    // 1. ゲストログインページにアクセス → ViewState取得
    const resp = await fetch(SYLLABUS_URL, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(15000),
    });

    if (!resp.ok) {
      throw new ScraperError(`Syllabus page returned ${resp.status}`, 'syllabus', 'http');
    }

    const html = await resp.text();
    const { load } = await import('cheerio');
    const $ = load(html);

    // ViewState取得
    const viewState = $('input[name="javax.faces.ViewState"]').val() as string;
    if (!viewState) {
      throw new ScraperError('ViewState not found on syllabus page', 'syllabus', 'http');
    }

    const cookies: Record<string, string> = {};
    const setCookies = resp.headers.getSetCookie?.() ?? [];
    for (const sc of setCookies) {
      const [pair] = sc.split(';');
      if (pair) {
        const eq = pair.indexOf('=');
        if (eq > 0) cookies[pair.substring(0, eq).trim()] = pair.substring(eq + 1).trim();
      }
    }

    // 2. 検索POST（科目名で部分一致検索）
    // WHY: JSFフォームのパラメータはページ構造に依存。構造変更時はここを修正
    const searchResp = await fetch(SYLLABUS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': USER_AGENT,
        Cookie: Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; '),
      },
      body: new URLSearchParams({
        'javax.faces.ViewState': viewState,
        // TODO: 正確なフォームパラメータはJSFページ構造に依存
        // ゲストログイン後のフォームフィールド名を実測で確定する必要がある
      }),
      signal: AbortSignal.timeout(15000),
    });

    const searchHtml = await searchResp.text();
    const $search = load(searchHtml);

    // 検索結果をパース
    const results: SyllabusData[] = [];

    $search('table.syllabus-list tbody tr, table[id*="syllabus"] tbody tr').each((_, row) => {
      const cells = $search(row).find('td');
      if (cells.length < 3) return;

      results.push({
        courseName: $search(cells[0]).text().trim(),
        courseCode: $search(cells[1]).text().trim() || null,
        instructor: $search(cells[2]).text().trim(),
        department: $search(cells[3]).text().trim() || '',
        campus: '',
        semester: '',
        dayOfWeek: null,
        period: null,
        objectives: null,
        schedule: null,
        evaluation: null,
        textbooks: null,
        originalUrl: SYLLABUS_URL,
      });
    });

    return results;
  } catch (error) {
    if (error instanceof ScraperError) throw error;
    throw new ScraperError('Syllabus search failed', 'syllabus', 'http', error);
  }
}
