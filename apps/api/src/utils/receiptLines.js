const formatDay = (date, timezone) =>
  new Intl.DateTimeFormat('en-IN', {
    timeZone: timezone,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(date));

/**
 * What a fee receipt says. The organization is the tenant's own name (it used to
 * be a fixed "RootEd School"), and a plan sale adds the plan and the period it
 * covers. Returns plain strings; the PDF only has to lay them out.
 */
export function buildReceiptLines({
  tenantName,
  receiptNumber,
  paymentDate,
  student,
  amount,
  paymentMethod,
  transactionId,
  planName,
  coversFrom,
  coversTo,
  timezone = 'Asia/Kolkata',
}) {
  const lines = [`Receipt No: ${receiptNumber}`, `Date: ${formatDay(paymentDate, timezone)}`];
  if (student) {
    lines.push(`Name: ${student.firstName} ${student.lastName}`.trim());
    lines.push(`Admission No: ${student.admissionNo}`);
  }
  if (planName) lines.push(`Plan: ${planName}`);
  if (coversFrom && coversTo) {
    const from = formatDay(coversFrom, timezone);
    const to = formatDay(coversTo, timezone);
    lines.push(from === to ? `Valid on: ${from}` : `Valid: ${from} to ${to}`);
  }
  lines.push(`Amount Paid: ${amount}`);
  lines.push(`Payment Method: ${paymentMethod}`);
  if (transactionId) lines.push(`Transaction ID: ${transactionId}`);
  return { organization: tenantName || null, lines };
}
