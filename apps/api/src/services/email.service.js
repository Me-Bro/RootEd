import { env } from '../config/env.js';
import { createSmtpTransport, sendViaSmtp } from './email/smtpAdapter.js';
import { sendViaPostmark } from './email/postmarkAdapter.js';

let smtpTransporter = null;
if (env.EMAIL_PROVIDER === 'smtp') {
  smtpTransporter = createSmtpTransport();
}

const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/**
 * Escapes a value for interpolation into an email body. sanitizeBody() cleans
 * request *input*; this is output encoding, which is what actually stops an
 * org name or a person's name from injecting markup into somebody else's
 * inbox. Every template below routes user-supplied values through it.
 */
export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);
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
    subject: 'Reset your RootEd password',
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
    subject: `You've been invited to ${tenantName} on RootEd`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
        <h2>Welcome to RootEd</h2>
        <p>You have been invited as the administrator of <strong>${escapeHtml(tenantName)}</strong>.</p>
        <p>Click the button below to set up your account.</p>
        <a href="${inviteUrl}" style="display:inline-block;padding:12px 24px;background:#3b82f6;color:#fff;border-radius:6px;text-decoration:none;font-weight:600">Accept Invitation</a>
        <p style="margin-top:24px;color:#6b7280;font-size:14px">This invitation link will expire in 48 hours.</p>
      </div>
    `,
  });
}

export async function sendApprovalRequest(
  email,
  requesterName,
  entityType,
  entityDescription,
  approveUrl
) {
  await sendEmail({
    to: email,
    subject: `Approval Required: ${entityType} from ${requesterName}`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
        <h2>Approval Request</h2>
        <p><strong>${escapeHtml(requesterName)}</strong> has submitted a ${escapeHtml(entityType)} that requires your approval.</p>
        <p><strong>Details:</strong> ${escapeHtml(entityDescription)}</p>
        <a href="${approveUrl}" style="display:inline-block;padding:12px 24px;background:#3b82f6;color:#fff;border-radius:6px;text-decoration:none;font-weight:600">Review &amp; Approve</a>
        <p style="margin-top:24px;color:#6b7280;font-size:14px">Please log in to RootEd to take action.</p>
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
        <p>The budget for <strong>${escapeHtml(category)}</strong> has reached <strong>${percentage.toFixed(1)}%</strong> utilization.</p>
        <p>Budget cap: ${cap}</p>
        <p>Please review spending to avoid exceeding the budget limit.</p>
        <p style="margin-top:24px;color:#6b7280;font-size:14px">Log in to RootEd to view detailed expense reports.</p>
      </div>
    `,
  });
}

export async function sendEmailVerification(email, verifyUrl) {
  await sendEmail({
    to: email,
    subject: 'Verify your RootEd email address',
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
        <h2>Confirm your email</h2>
        <p>Click the button below to verify this address and finish setting up your RootEd account. This link expires in 24 hours.</p>
        <a href="${verifyUrl}" style="display:inline-block;padding:12px 24px;background:#3b82f6;color:#fff;border-radius:6px;text-decoration:none;font-weight:600">Verify Email</a>
        <p style="margin-top:24px;color:#6b7280;font-size:14px">If you did not create a RootEd account, ignore this email.</p>
      </div>
    `,
  });
}

export async function sendEmailChangeConfirmation(newEmail, confirmUrl) {
  await sendEmail({
    to: newEmail,
    subject: 'Confirm your new RootEd email address',
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
        <h2>Confirm your new email</h2>
        <p>A RootEd account asked to change its sign-in address to this one. Click below to confirm. This link expires in 1 hour.</p>
        <a href="${confirmUrl}" style="display:inline-block;padding:12px 24px;background:#3b82f6;color:#fff;border-radius:6px;text-decoration:none;font-weight:600">Confirm Email</a>
        <p style="margin-top:24px;color:#6b7280;font-size:14px">If this wasn't you, ignore this email — nothing changes until the link is used.</p>
      </div>
    `,
  });
}

// Sent to the *old* address. Without this, someone with a stolen session could
// move the account to an address of their choosing and the real owner would
// never find out.
export async function sendEmailChangeNotice(currentEmail, newEmail) {
  await sendEmail({
    to: currentEmail,
    subject: 'Your RootEd email address is being changed',
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
        <h2>Email change requested</h2>
        <p>Someone requested that this account's sign-in address be changed to <strong>${escapeHtml(newEmail)}</strong>. The change only takes effect once that address is confirmed.</p>
        <p style="margin-top:24px;color:#6b7280;font-size:14px">If this wasn't you, change your password immediately — your account may be compromised.</p>
      </div>
    `,
  });
}

// Registration answers identically whether or not the address is already in
// use — otherwise the endpoint is an account-enumeration oracle, which would
// undo the care taken in /auth/forgot-password. The person who actually owns
// the address still gets told what happened, here.
export async function sendAccountExistsNotice(email, loginUrl, resetUrl) {
  await sendEmail({
    to: email,
    subject: 'You already have a RootEd account',
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
        <h2>You already have an account</h2>
        <p>Someone tried to register a RootEd account with this email address, but one already exists.</p>
        <p><a href="${loginUrl}">Sign in</a> &middot; <a href="${resetUrl}">Reset your password</a></p>
        <p style="margin-top:24px;color:#6b7280;font-size:14px">If this wasn't you, no action is needed — no new account was created.</p>
      </div>
    `,
  });
}

export async function sendAccountClaim(email, orgName, claimUrl) {
  await sendEmail({
    to: email,
    subject: `Set up your RootEd account for ${orgName}`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
        <h2>Your account is ready</h2>
        <p><strong>${escapeHtml(orgName)}</strong> has created a RootEd account for you. Choose a password to start using it.</p>
        <a href="${claimUrl}" style="display:inline-block;padding:12px 24px;background:#3b82f6;color:#fff;border-radius:6px;text-decoration:none;font-weight:600">Set Your Password</a>
        <p style="margin-top:24px;color:#6b7280;font-size:14px">This link expires in 30 days. If you were not expecting this, ignore this email.</p>
      </div>
    `,
  });
}

let bulkEmailQueue;

/**
 * Queues an email instead of sending it inline. A roster import can produce
 * hundreds: sending them in the request times it out, and a partial send cannot
 * be resumed or told apart from a complete one.
 */
export async function queueEmail(kind, args) {
  const { Queue } = await import('bullmq');
  const { redis } = await import('../config/redis.js');
  const { BULK_EMAIL_QUEUE } = await import('../workers/bulkEmail.worker.js');
  if (!bulkEmailQueue) bulkEmailQueue = new Queue(BULK_EMAIL_QUEUE, { connection: redis });
  await bulkEmailQueue.add(kind, { kind, args }, { removeOnComplete: 500, attempts: 3 });
}
