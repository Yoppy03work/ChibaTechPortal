/**
 * CIT ポータル掲示板 (Bsd00701) のお知らせ一覧パーサ。
 *
 * WHY: お知らせ本体は掲示板ページの PrimeFaces タブ (funcForm:tabArea) に
 * インラインで載る (休講/補講/教室変更/教務 等)。各タブに同じ通知が重複して出るため
 * タイトルで dedupe する。詳細本文は PrimeFaces ajax 展開が必要なため一覧段階では body='' とし、
 * タイトル + カテゴリ + 日付(題に埋込) を抽出する。
 *
 * externalId: JSF コンポーネント id (funcForm:tabArea:N:...:j_idtXXX) は描画毎に変わり
 * 差分検出に使えない。タイトルの安定ハッシュを externalId にする (同一タイトル=同一通知)。
 */
import { load } from 'cheerio';
import { createHash } from 'node:crypto';
import type { ScrapedNotificationItem } from '@chibatech/shared';
import { getJstParts } from '@chibatech/shared';

// カテゴリ判定 (優先順。先にマッチしたものを採用)。
const CATEGORY_KEYWORDS = ['教室変更', '補講', '休講', '教務', '課題', '教材'] as const;

export function categoryOfTitle(title: string): string {
  for (const kw of CATEGORY_KEYWORDS) if (title.includes(kw)) return kw;
  return 'その他';
}

/**
 * 題から日付を best-effort 抽出する。"6月20日" / "5/8" / "6/20" に対応。
 * JST のカレンダー日を UTC midnight として作る (host TZ 非依存。timetable と同じ流儀)。
 * 年は now(JST) の年を採用 (掲示板に年表記が無いため)。見つからなければ null。
 */
export function parseDateFromTitle(title: string, now: Date): Date | null {
  let m = title.match(/(\d{1,2})月(\d{1,2})日/);
  if (!m) m = title.match(/(?:^|[\s（(])(\d{1,2})\/(\d{1,2})(?=[\s）)\D]|$)/);
  if (!m) return null;
  const month = Number(m[1]);
  const day = Number(m[2]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const jst = getJstParts(now);
  return new Date(Date.UTC(jst.year, month - 1, day, -9, 0, 0));
}

export interface ParseNotificationsOptions {
  /** 題に日付が無い通知の publishedAt フォールバック (既定: 現在時刻=スクレイプ時刻)。 */
  now?: Date;
}

export function parseCitPortalNotifications(
  html: string,
  opts: ParseNotificationsOptions = {}
): ScrapedNotificationItem[] {
  const now = opts.now ?? new Date();
  const $ = load(html);
  const seen = new Set<string>();
  const out: ScrapedNotificationItem[] = [];

  // 掲示板タブ内の、PrimeFaces ajax で開く通知リンク。
  $('a[id^="funcForm:tabArea"][onclick*="PrimeFaces.ab"]').each((_, el) => {
    const title = $(el).text().replace(/\s+/g, ' ').trim();
    // ページャ等の短いラベルを除外し、実通知のみ拾う。
    if (title.length < 6) return;
    if (seen.has(title)) return;
    seen.add(title);
    const externalId =
      'cit-keiji-' + createHash('sha1').update(title).digest('hex').slice(0, 16);
    const published = parseDateFromTitle(title, now);
    out.push({
      externalId,
      title,
      body: '', // 詳細本文は ajax 展開が必要なため一覧段階では空。
      url: '',
      publishedAt: published ?? now,
    });
  });

  return out;
}
