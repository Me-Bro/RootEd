import { format } from 'date-fns';

// The calendar day on this device, as YYYY-MM-DD. `toISOString()` gives the UTC day,
// which in IST is yesterday until 05:30.
export function localDay(date = new Date()) {
  return format(date, 'yyyy-MM-dd');
}

export function formatCurrency(amount, currency = 'INR', locale = 'en-IN') {
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(amount);
}

const pad = (n) => String(n).padStart(2, '0');

// Every date the UI shows is DD-MM-YYYY (local calendar day), whatever the browser locale.
// Empty or unparseable input gives '' so callers can fall back to a dash.
export function formatDate(date) {
  if (!date) return '';
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  return `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()}`;
}

// 12-hour clock with AM/PM, e.g. "02:30 PM".
export function formatTime(date) {
  if (!date) return '';
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  })
    .format(d)
    .toUpperCase();
}

// e.g. "11-11-2026, 02:30 PM"
export function formatDateTime(date) {
  const d = formatDate(date);
  return d ? `${d}, ${formatTime(date)}` : '';
}

// A weekday name or a month name on its own is a label, not a date, so it stays a word.
export function formatWeekday(date) {
  return new Intl.DateTimeFormat('en-IN', { weekday: 'long' }).format(new Date(date));
}

export function formatMonth(date) {
  return new Intl.DateTimeFormat('en-IN', { month: 'long' }).format(new Date(date));
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
