/**
 * 出席結果メールテンプレート
 */

interface AttendanceEmailParams {
  className: string;
  period: number;
  success: boolean;
  message: string;
  date: string;
}

export function attendanceEmail(params: AttendanceEmailParams): {
  subject: string;
  html: string;
  text: string;
} {
  const { className, period, success, message, date } = params;
  const icon = success ? '✓' : '✗';
  const status = success ? '出席完了' : '出席失敗';

  const subject = `[ChibaTechPortal] ${icon} ${period}限 ${className} ${status}`;

  const text = [
    `${period}限 ${className} - ${status}`,
    `日時: ${date}`,
    `結果: ${message}`,
    '',
    success ? '' : '手動で出席してください。',
    'ChibaTechPortal - 千葉工業大学統合ポータル',
  ].join('\n');

  const bgColor = success ? '#C6F6D5' : '#FED7D7';
  const textColor = success ? '#276749' : '#9B2C2C';

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8" /></head>
<body style="font-family:'Hiragino Sans','Noto Sans JP',sans-serif;color:#0A0A0A;max-width:600px;margin:0 auto;padding:20px;">
  <div style="background:#1E3A5F;color:white;padding:16px 20px;border-radius:8px 8px 0 0;">
    <h1 style="margin:0;font-size:14px;">ChibaTechPortal</h1>
  </div>
  <div style="border:1px solid #E2E8F0;border-top:none;padding:20px;border-radius:0 0 8px 8px;">
    <div style="background:${bgColor};color:${textColor};padding:16px;border-radius:8px;text-align:center;margin-bottom:16px;">
      <p style="font-size:24px;margin:0;">${icon}</p>
      <p style="font-size:16px;font-weight:bold;margin:4px 0 0;">${status}</p>
    </div>
    <p style="font-size:14px;margin:0 0 4px;"><strong>${period}限 ${className}</strong></p>
    <p style="font-size:12px;color:#718096;margin:0;">${date}</p>
    ${!success ? '<p style="color:#E53E3E;font-size:14px;margin-top:12px;">手動で出席してください。</p>' : ''}
  </div>
  <p style="text-align:center;font-size:11px;color:#A0AEC0;margin-top:16px;">ChibaTechPortal - 千葉工業大学統合ポータル</p>
</body>
</html>`;

  return { subject, html, text };
}
