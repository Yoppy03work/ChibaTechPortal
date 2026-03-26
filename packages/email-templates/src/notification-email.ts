/**
 * お知らせ通知メールテンプレート
 *
 * WHY: 設計書のメール通知仕様に基づく。概要+URL形式。
 */

interface NotificationEmailParams {
  title: string;
  source: string; // 'CIT Portal' | 'manaba'
  publishedAt: string;
  body: string; // 先頭200文字
  originalUrl: string;
  portalUrl: string;
}

export function notificationEmail(params: NotificationEmailParams): {
  subject: string;
  html: string;
  text: string;
} {
  const { title, source, publishedAt, body, originalUrl, portalUrl } = params;

  const subject = `[ChibaTechPortal] ${source}: ${title}`;

  const text = [
    title,
    '━'.repeat(30),
    `ソース: ${source}`,
    `日時:   ${publishedAt}`,
    '━'.repeat(30),
    '',
    '【概要】',
    body.substring(0, 200) + (body.length > 200 ? '...' : ''),
    '',
    '【リンク】',
    `▶ 元のページ: ${originalUrl}`,
    `▶ Portalで見る: ${portalUrl}`,
    '━'.repeat(30),
    'ChibaTechPortal - 千葉工業大学統合ポータル',
  ].join('\n');

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
      <span style="display:inline-block;background:${source === 'CIT Portal' ? '#1E3A5F' : '#2563EB'};color:white;padding:2px 8px;border-radius:4px;font-size:11px;">${source}</span>
      &nbsp;${publishedAt}
    </p>
    <h2 style="margin:8px 0 16px;font-size:18px;color:#0A0A0A;">${title}</h2>
    <div style="background:#F7FAFC;padding:12px;border-radius:6px;font-size:14px;line-height:1.6;color:#4A5568;">
      ${body.substring(0, 200)}${body.length > 200 ? '...' : ''}
    </div>
    <div style="margin-top:20px;">
      <a href="${originalUrl}" style="display:block;text-align:center;background:#2563EB;color:white;padding:10px;border-radius:6px;text-decoration:none;font-size:14px;margin-bottom:8px;">元のページを開く</a>
      <a href="${portalUrl}" style="display:block;text-align:center;border:1px solid #2563EB;color:#2563EB;padding:10px;border-radius:6px;text-decoration:none;font-size:14px;">Portalで見る</a>
    </div>
  </div>
  <p style="text-align:center;font-size:11px;color:#A0AEC0;margin-top:16px;">ChibaTechPortal - 千葉工業大学統合ポータル</p>
</body>
</html>`;

  return { subject, html, text };
}
