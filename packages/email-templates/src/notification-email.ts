/**
 * お知らせ通知メールテンプレート
 *
 * WHY: 設計書のメール通知仕様に基づく。概要+URL形式。
 * 外部由来データ（title, body, originalUrl）は必ずHTMLエスケープする。
 */

interface NotificationEmailParams {
  title: string;
  source: string; // 'CIT Portal' | 'manaba'
  publishedAt: string;
  body: string; // 先頭200文字
  originalUrl: string;
  portalUrl: string;
}

/**
 * HTMLエンティティにエスケープする
 * WHY: 外部由来データをHTML内に埋め込む際のHTML注入を防止
 */
function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

/**
 * URLをサニタイズする
 * WHY: javascript: やdata: スキームによるリンク改ざんを防止
 */
function sanitizeUrl(url: string): string {
  if (!url) return '';
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return '';
    }
    return escapeHtml(url);
  } catch {
    return '';
  }
}

export function notificationEmail(params: NotificationEmailParams): {
  subject: string;
  html: string;
  text: string;
} {
  const { source, publishedAt } = params;
  // WHY: 外部由来データは全てエスケープしてからテンプレートに埋め込む
  const safeTitle = escapeHtml(params.title);
  const safeBody = escapeHtml(params.body.substring(0, 200)) + (params.body.length > 200 ? '...' : '');
  const safeOriginalUrl = sanitizeUrl(params.originalUrl);
  const safePortalUrl = sanitizeUrl(params.portalUrl);
  const safeSource = escapeHtml(source);
  const safePublishedAt = escapeHtml(publishedAt);

  const subject = `[ChibaTechPortal] ${source}: ${params.title}`;

  const text = [
    params.title,
    '━'.repeat(30),
    `ソース: ${source}`,
    `日時:   ${publishedAt}`,
    '━'.repeat(30),
    '',
    '【概要】',
    params.body.substring(0, 200) + (params.body.length > 200 ? '...' : ''),
    '',
    '【リンク】',
    `▶ 元のページ: ${params.originalUrl}`,
    `▶ Portalで見る: ${params.portalUrl}`,
    '━'.repeat(30),
    'ChibaTechPortal - 千葉工業大学統合ポータル',
  ].join('\n');

  const sourceBgColor = source === 'CIT Portal' ? '#1E3A5F' : '#2563EB';

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8" /></head>
<body style="font-family:'Hiragino Sans','Noto Sans JP',sans-serif;color:#0A0A0A;max-width:600px;margin:0 auto;padding:20px;">
  <div style="background:#1E3A5F;color:white;padding:16px 20px;border-radius:8px 8px 0 0;">
    <h1 style="margin:0;font-size:14px;">ChibaTechPortal</h1>
  </div>
  <div style="border:1px solid #E2E8F0;border-top:none;padding:20px;border-radius:0 0 8px 8px;">
    <p style="font-size:12px;color:#718096;margin:0 0 4px;">
      <span style="display:inline-block;background:${sourceBgColor};color:white;padding:2px 8px;border-radius:4px;font-size:11px;">${safeSource}</span>
      &nbsp;${safePublishedAt}
    </p>
    <h2 style="margin:8px 0 16px;font-size:18px;color:#0A0A0A;">${safeTitle}</h2>
    <div style="background:#F7FAFC;padding:12px;border-radius:6px;font-size:14px;line-height:1.6;color:#4A5568;">
      ${safeBody}
    </div>
    <div style="margin-top:20px;">
      ${safeOriginalUrl ? `<a href="${safeOriginalUrl}" style="display:block;text-align:center;background:#2563EB;color:white;padding:10px;border-radius:6px;text-decoration:none;font-size:14px;margin-bottom:8px;">元のページを開く</a>` : ''}
      ${safePortalUrl ? `<a href="${safePortalUrl}" style="display:block;text-align:center;border:1px solid #2563EB;color:#2563EB;padding:10px;border-radius:6px;text-decoration:none;font-size:14px;">Portalで見る</a>` : ''}
    </div>
  </div>
  <p style="text-align:center;font-size:11px;color:#A0AEC0;margin-top:16px;">ChibaTechPortal - 千葉工業大学統合ポータル</p>
</body>
</html>`;

  return { subject, html, text };
}
