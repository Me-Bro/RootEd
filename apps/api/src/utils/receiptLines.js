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

const inr = (digits) =>
  new Intl.NumberFormat('en-IN', { minimumFractionDigits: digits, maximumFractionDigits: digits });
const inrWhole = inr(0);
const inrPaise = inr(2);
// Whole rupees print bare, anything with paise prints both decimals.
export const formatInr = (n) => `₹${(Number.isInteger(n) ? inrWhole : inrPaise).format(n)}`;

const ONES = [
  '',
  'One',
  'Two',
  'Three',
  'Four',
  'Five',
  'Six',
  'Seven',
  'Eight',
  'Nine',
  'Ten',
  'Eleven',
  'Twelve',
  'Thirteen',
  'Fourteen',
  'Fifteen',
  'Sixteen',
  'Seventeen',
  'Eighteen',
  'Nineteen',
];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

const below100 = (n) => (n < 20 ? ONES[n] : `${TENS[Math.floor(n / 10)]} ${ONES[n % 10]}`.trim());
const below1000 = (n) =>
  [n >= 100 && `${ONES[Math.floor(n / 100)]} Hundred`, n % 100 && below100(n % 100)]
    .filter(Boolean)
    .join(' ');

/** 12345.5 -> "Rupees Twelve Thousand Three Hundred Forty Five and Fifty Paise Only" (Indian grouping). */
export function amountInWords(amount) {
  const paise = Math.round(Number(amount) * 100);
  if (!Number.isFinite(paise) || paise < 0) return '';
  const rupees = Math.floor(paise / 100);
  const ps = paise % 100;
  const crore = Math.floor(rupees / 10000000);
  const lakh = Math.floor(rupees / 100000) % 100;
  const thousand = Math.floor(rupees / 1000) % 100;
  const parts = [
    crore && `${below1000(crore)} Crore`,
    lakh && `${below100(lakh)} Lakh`,
    thousand && `${below100(thousand)} Thousand`,
    rupees % 1000 && below1000(rupees % 1000),
  ].filter(Boolean);
  const rs = parts.join(' ') || 'Zero';
  return `Rupees ${rs}${ps ? ` and ${below100(ps)} Paise` : ''} Only`;
}

const methodLabel = (m) =>
  String(m ?? '')
    .replace(/_/g, ' ')
    .replace(/^\w/, (c) => c.toUpperCase());

/**
 * Structured receipt content for the PDF layout: header (org, address, contact),
 * two detail columns, one table row, and the money in figures and words.
 */
export function buildReceiptView({
  tenantName,
  profile = {},
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
  const a = profile?.address ?? {};
  const cityLine =
    [a.city, a.state].filter(Boolean).join(', ') + (a.pincode ? ` - ${a.pincode}` : '');
  const address = [a.line1, a.line2, cityLine].map((s) => s?.trim()).filter(Boolean);
  const contact = [profile?.phone, profile?.email].filter(Boolean).join('  |  ');

  let period = '-';
  if (coversFrom && coversTo) {
    const from = formatDay(coversFrom, timezone);
    const to = formatDay(coversTo, timezone);
    period = from === to ? from : `${from} to ${to}`;
  }
  const payer = student
    ? [
        ['Received from', `${student.firstName ?? ''} ${student.lastName ?? ''}`.trim()],
        ['Admission No', student.admissionNo],
      ]
    : [];
  return {
    organization: tenantName || null,
    address,
    contact,
    registrationNumber: profile?.registrationNumber || null,
    meta: [
      ['Receipt No', receiptNumber],
      ['Date', formatDay(paymentDate, timezone)],
    ],
    payer,
    item: { description: planName || 'Fee payment', period, amount: formatInr(amount) },
    method: methodLabel(paymentMethod),
    transactionId: transactionId || null,
    total: formatInr(amount),
    words: amountInWords(amount),
  };
}
