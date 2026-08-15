import { env } from '../../config/env.js';

export async function sendViaPostmark({ to, subject, html }) {
  if (!env.POSTMARK_API_TOKEN) return;
  const { ServerClient } = await import('postmark');
  const client = new ServerClient(env.POSTMARK_API_TOKEN);
  await client.sendEmail({
    From: env.EMAIL_FROM,
    To: to,
    Subject: subject,
    HtmlBody: html,
  });
}
