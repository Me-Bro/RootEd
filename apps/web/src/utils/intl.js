export function formatCurrency(amount, currency = 'INR', locale = 'en-IN') {
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(amount);
}

export function formatDate(date, locale = 'en-IN', options = { day: '2-digit', month: 'short', year: 'numeric' }) {
  return new Intl.DateTimeFormat(locale, options).format(new Date(date));
}

export function formatNumber(n, locale = 'en-IN') {
  return new Intl.NumberFormat(locale).format(n);
}

export function formatRelativeTime(date) {
  const diff = (new Date(date) - Date.now()) / 1000;
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  if (Math.abs(diff) < 60) return rtf.format(Math.round(diff), 'second');
  if (Math.abs(diff) < 3600) return rtf.format(Math.round(diff / 60), 'minute');
  if (Math.abs(diff) < 86400) return rtf.format(Math.round(diff / 3600), 'hour');
  return rtf.format(Math.round(diff / 86400), 'day');
}
