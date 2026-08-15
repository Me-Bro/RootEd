import nodemailer from 'nodemailer';
import { env } from '../../config/env.js';

export function createSmtpTransport() {
  if (!env.SMTP_HOST) return null;
  return nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
  });
}

export async function sendViaSmtp(transporter, { to, subject, html }) {
  if (!transporter) return;
  await transporter.sendMail({ from: env.EMAIL_FROM, to, subject, html });
}
