/**
 * CIT シラバス照会(Kmh006)を SSO で取得し、ユーザーの履修科目に紐づけて DB に同期する。
 *
 * フロー: ユーザーの Timetable の className → 検索用科目名に正規化(cleanCourseName) →
 *        fetchCitSyllabiForCourses(**1 ログイン**でまとめ取得) → parseCitSyllabusDetail →
 *        Syllabus を upsert → 該当 Timetable 行の syllabusId を更新。
 *
 * セキュリティ: creds/TOTP secret は env から読む ([[cit-portal-env]])。
 * ゲート: isCitSyllabusSyncEnabled() (SCRAPE_ENABLED + CIT_SYLLABUS_SYNC_ENABLED + creds)。
 *   無効・creds 欠如時は外部アクセスせず skip (fail-closed)。
 *
 * 注: Syllabus モデルの department/campus は科目シラバス詳細から確実に取れないため
 * phase 0 では空文字。academicYear/semester は詳細の「開講年度学期」由来、取れなければ
 * 現在の年度/学期で補完する。
 */
import { prisma } from '@chibatech/db';
import { fetchCitSyllabiForCourses } from '../scrapers/cit-portal/cit-portal-scraper';
import {
  parseCitSyllabusDetail,
  type ParsedSyllabus,
} from '../scrapers/cit-portal/syllabus-parser';
import {
  getCitPortalSyncConfig,
  isCitSyllabusSyncEnabled,
} from '../lib/cit-portal-env';

/** originalUrl 用のシラバス照会ページ(Kmh006)。詳細は JSF POST で安定 URL が無いため照会ページを記録。 */
function syllabusOriginalUrl(): string {
  const base = (process.env.CIT_PORTAL_BASE_URL ?? 'https://portal.chibatech.ac.jp').replace(
    /\/$/,
    '',
  );
  return `${base}/uprx/up/km/kmh006/Kmh00601.xhtml`;
}

/** 日本の年度: 4月以降はその年、1〜3月は前年。 */
function currentAcademicYear(now = new Date()): number {
  return now.getMonth() + 1 >= 4 ? now.getFullYear() : now.getFullYear() - 1;
}
/** 月ベースの学期補完: 4〜9月=前期, それ以外=後期。 */
function currentSemester(now = new Date()): '前期' | '後期' {
  const m = now.getMonth() + 1;
  return m >= 4 && m <= 9 ? '前期' : '後期';
}

/**
 * 時間割の className から検索用の科目名を取り出す。
 * 例: "オペレーティングシステム 情工3年 ※情報" → "オペレーティングシステム"。
 * - "※..." 以降の備考を除去
 * - 空白に続く「{学科?}{学年}年(次/生)」(対象学年表記) 以降を除去
 *
 * WHY: 学年は大学の 1〜6 年。`\d+年` のような貪欲一致だと "西暦2000年問題" の
 * "2000年" や "年度" まで巻き込んで科目名を削りすぎるので、学年は単一桁 [1-6] に限定し
 * 「年度」は除外する(負の先読み)。検索は部分一致なので多少の過不足は許容される。
 */
export function cleanCourseName(className: string): string {
  let s = className.replace(/\s*※.*$/u, '');
  s = s.replace(/\s+\S*[1-6]\s*年(?!度)(?:次|生)?.*$/u, '');
  return s.trim();
}

/** テスト用に外部 I/O を差し替え可能にする (既定は本番実装)。 */
export interface CitSyllabusSyncDeps {
  fetchSyllabi?: (
    userId: string,
    password: string,
    totpSecret: string,
    totpDeviceName: string | null,
    courseNames: string[],
  ) => Promise<Array<{ courseName: string; html: string | null }>>;
  parse?: (html: string) => ParsedSyllabus;
}

export type CitSyllabusSyncResult =
  | { ran: true; courses: number; synced: number; linked: number }
  | { ran: false; reason: 'disabled' | 'empty' };

/**
 * CIT シラバスを 1 回同期する。無効なら外部アクセスせず {ran:false,reason:'disabled'}。
 * 履修科目 0 件なら {ran:false,reason:'empty'}。個々の科目の取得/解析失敗は skip して継続。
 */
export async function runCitSyllabusSync(
  deps: CitSyllabusSyncDeps = {},
): Promise<CitSyllabusSyncResult> {
  if (!isCitSyllabusSyncEnabled()) return { ran: false, reason: 'disabled' };
  const cfg = getCitPortalSyncConfig();
  if (!cfg) return { ran: false, reason: 'disabled' };

  const fetchSyllabi = deps.fetchSyllabi ?? fetchCitSyllabiForCourses;
  const parse = deps.parse ?? parseCitSyllabusDetail;

  // 1) 履修(時間割) → 検索科目名。同名は複数コマでも 1 回だけ検索し、全コマに紐づける。
  const rows = await prisma.timetable.findMany({
    where: { userId: cfg.syncUserId },
    select: { id: true, className: true },
  });
  const idsByCourse = new Map<string, string[]>();
  for (const r of rows) {
    const name = cleanCourseName(r.className);
    if (!name) continue;
    const arr = idsByCourse.get(name) ?? [];
    arr.push(r.id);
    idsByCourse.set(name, arr);
  }
  const courseNames = [...idsByCourse.keys()];
  if (courseNames.length === 0) return { ran: false, reason: 'empty' };

  // 2) 1 ログインでまとめて取得 (TOTP 再送回避)
  const fetched = await fetchSyllabi(
    cfg.userId,
    cfg.password,
    cfg.totpSecret,
    cfg.totpDeviceName,
    courseNames,
  );

  // 3) parse → Syllabus upsert → Timetable.syllabusId 紐付け
  let synced = 0;
  let linked = 0;
  for (const { courseName, html } of fetched) {
    if (!html) continue;
    try {
      const parsed = parse(html);
      const syllabus = await upsertSyllabus(courseName, parsed);
      synced++;
      const ids = idsByCourse.get(courseName) ?? [];
      if (ids.length > 0) {
        const res = await prisma.timetable.updateMany({
          where: { id: { in: ids } },
          data: { syllabusId: syllabus.id },
        });
        linked += res.count;
      }
    } catch (error) {
      // WHY: 1 科目の解析/DB エラーで全体を止めない (fail-soft)。
      console.warn(
        `[cit-syllabus-sync] 科目の保存に失敗 (継続): ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  console.log(
    `[cit-syllabus-sync] user=${cfg.syncUserId} courses=${courseNames.length} synced=${synced} linked=${linked}`,
  );
  return { ran: true, courses: courseNames.length, synced, linked };
}

/**
 * (academicYear, courseName) を自然キーに Syllabus を upsert する。
 * DB の一意制約(academicYear_courseName)を backstop に、再同期で重複行を作らない。
 */
async function upsertSyllabus(searchName: string, p: ParsedSyllabus) {
  const academicYear = p.academicYear ?? currentAcademicYear();
  const semester = p.semesterTerm ?? currentSemester();
  const courseName = p.courseName ?? searchName;

  const data = {
    academicYear,
    semester,
    courseName,
    courseCode: p.numbering ?? null,
    instructor: p.instructor ?? '',
    // WHY: 科目シラバス詳細から確実に取れないため phase 0 では空。後で enrich 可能。
    department: '',
    campus: '',
    period: p.dayPeriod ?? null,
    category: p.semester ?? null, // 開講学期コード(例 "5S")を category に残す
    objectives: p.objectives ?? null,
    schedule: p.schedule ?? null,
    evaluation: p.evaluation ?? null,
    textbooks: p.textbooks ?? null,
    originalUrl: syllabusOriginalUrl(),
    fetchedAt: new Date(),
  };

  return prisma.syllabus.upsert({
    where: { academicYear_courseName: { academicYear, courseName } },
    create: data,
    update: data,
  });
}
