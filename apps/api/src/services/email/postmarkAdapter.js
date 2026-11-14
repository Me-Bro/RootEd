import { env } from '../../config/env.js';

export async function sendViaPostmark({ to, subject, html }) {
  if (!env.POSTMARK_API_TOKEN) return { skipped: 'not_configured' };
  const { ServerClient } = await import('postmark');
  const client = new ServerClient(env.POSTMARK_API_TOKEN);
  const res = await client.sendEmail({
    From: env.EMAIL_FROM,
    To: to,
    Subject: subject,
    HtmlBody: html,
  });
  return { messageId: res?.MessageID };
}
