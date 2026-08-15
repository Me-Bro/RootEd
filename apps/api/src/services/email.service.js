import { env } from '../config/env.js';
import { createSmtpTransport, sendViaSmtp } from './email/smtpAdapter.js';
import { sendViaPostmark } from './email/postmarkAdapter.js';

let smtpTransporter = null;
if (env.EMAIL_PROVIDER === 'smtp') {
  smtpTransporter = createSmtpTransport();
}

export async function sendEmail({ to, subject, html }) {
  if (env.EMAIL_PROVIDER === 'postmark') {
    return sendViaPostmark({ to, subject, html });
  }
  return sendViaSmtp(smtpTransporter, { to, subject, html });
}

export async function sendPasswordReset(email, resetUrl) {
  await sendEmail({
    to: email,
    subject: 'Reset your EduFlow password',
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
        <h2>Password Reset</h2>
        <p>You requested a password reset. Click the button below to set a new password. This link expires in 30 minutes.</p>
        <a href="${resetUrl}" style="display:inline-block;padding:12px 24px;background:#3b82f6;color:#fff;border-radius:6px;text-decoration:none;font-weight:600">Reset Password</a>
        <p style="margin-top:24px;color:#6b7280;font-size:14px">If you did not request this, ignore this email.</p>
      </div>
    `,
  });
}

export async function sendTenantInvite(email, tenantName, inviteUrl) {
  await sendEmail({
    to: email,
    subject: `You've been invited to ${tenantName} on EduFlow`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
        <h2>Welcome to EduFlow</h2>
        <p>You have been invited as the administrator of <strong>${tenantName}</strong>.</p>
        <p>Click the button below to set up your account.</p>
        <a href="${inviteUrl}" style="display:inline-block;padding:12px 24px;background:#3b82f6;color:#fff;border-radius:6px;text-decoration:none;font-weight:600">Accept Invitation</a>
        <p style="margin-top:24px;color:#6b7280;font-size:14px">This invitation link will expire in 48 hours.</p>
      </div>
    `,
  });
}

export async function sendApprovalRequest(email, requesterName, entityType, entityDescription, approveUrl) {
  await sendEmail({
    to: email,
    subject: `Approval Required: ${entityType} from ${requesterName}`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
        <h2>Approval Request</h2>
        <p><strong>${requesterName}</strong> has submitted a ${entityType} that requires your approval.</p>
        <p><strong>Details:</strong> ${entityDescription}</p>
        <a href="${approveUrl}" style="display:inline-block;padding:12px 24px;background:#3b82f6;color:#fff;border-radius:6px;text-decoration:none;font-weight:600">Review &amp; Approve</a>
        <p style="margin-top:24px;color:#6b7280;font-size:14px">Please log in to EduFlow to take action.</p>
      </div>
    `,
  });
}

export async function sendBudgetAlert(email, category, percentage, cap) {
  await sendEmail({
    to: email,
    subject: `Budget Alert: ${category} at ${percentage.toFixed(1)}% utilization`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
        <h2>Budget Alert</h2>
        <p>The budget for <strong>${category}</strong> has reached <strong>${percentage.toFixed(1)}%</strong> utilization.</p>
        <p>Budget cap: ${cap}</p>
        <p>Please review spending to avoid exceeding the budget limit.</p>
        <p style="margin-top:24px;color:#6b7280;font-size:14px">Log in to EduFlow to view detailed expense reports.</p>
      </div>
    `,
  });
}
