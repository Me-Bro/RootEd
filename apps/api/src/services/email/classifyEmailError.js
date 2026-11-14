/**
 * Buckets a provider error into a reason the stats page can group on.
 * `rate_limit` is the one that matters for the free-vs-paid decision.
 * Handles nodemailer (err.code string, err.responseCode SMTP int) and Postmark
 * (err.code is the numeric ErrorCode, err.statusCode the HTTP status).
 */
export function classifyEmailError(err) {
  const code = String(err?.code ?? '');
  const smtp = Number(err?.responseCode) || 0;
  const http = Number(err?.statusCode) || 0;
  const message = String(err?.message ?? '');

  if (
    http === 429 ||
    smtp === 421 ||
    smtp === 450 ||
    smtp === 451 ||
    smtp === 452 ||
    smtp === 454 ||
    /rate|quota|too many|limit exceeded|daily/i.test(message)
  ) {
    return 'rate_limit';
  }
  if (code === 'EAUTH' || smtp === 530 || smtp === 535 || http === 401) return 'auth';
  if (['ECONNECTION', 'ETIMEDOUT', 'ESOCKET', 'ECONNREFUSED', 'ENOTFOUND', 'EDNS'].includes(code)) {
    return 'connection';
  }
  // Postmark: 300 invalid email, 406 inactive recipient.
  if (code === '300' || code === '406' || (smtp >= 550 && smtp <= 554)) return 'recipient_rejected';
  return 'other';
}
