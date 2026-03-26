/**
 * メール送信サービス
 *
 * WHY: Resend APIでメール送信。無料枠で月3,000通。
 */
import { Resend } from 'resend';

const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const FROM_ADDRESS = 'ChibaTechPortal <noreply@chibatech-portal.example.com>';

const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;

export async function sendEmail(params: {
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<void> {
  if (!resend) {
    console.warn('[email] RESEND_API_KEY not set, skipping email');
    return;
  }

  const { error } = await resend.emails.send({
    from: FROM_ADDRESS,
    to: params.to,
    subject: params.subject,
    html: params.html,
    text: params.text,
  });

  if (error) {
    console.error('[email] Send failed:', error.message);
    throw new Error(`Email send failed: ${error.message}`);
  }
}
