// 12-hour clock helpers for TimeInput. The value in and out of the field stays the
// 24-hour 'HH:mm' string a native time input uses, so schemas and API payloads are unchanged.

/** '19:05' -> { text: '07:05', period: 'PM' }; anything else -> { text: '', period: null }. */
export function toParts(value) {
  const m = /^([01]\d|2[0-3]):([0-5]\d)/.exec(value ?? '');
  if (!m) return { text: '', period: null };
  const h = Number(m[1]);
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return { text: `${String(h12).padStart(2, '0')}:${m[2]}`, period: h >= 12 ? 'PM' : 'AM' };
}

/** ('07:05', 'PM') -> '19:05'. '' unless the text is a real 12-hour time (1-12 : 00-59). */
export function fromParts(text, period) {
  const m = /^(\d{1,2}):([0-5]\d)$/.exec(text ?? '');
  if (!m) return '';
  const h12 = Number(m[1]);
  if (h12 < 1 || h12 > 12) return '';
  const h = (h12 % 12) + (period === 'PM' ? 12 : 0);
  return `${String(h).padStart(2, '0')}:${m[2]}`;
}

/** Keeps digits only and inserts the colon as the user types: '0830' -> '08:30', '830' -> '8:30'. */
export function maskTime(raw) {
  const digits = String(raw ?? '')
    .replace(/\D/g, '')
    .slice(0, 4);
  // Two digits form the hour when they are 10-12 or start with 0 ('08'); otherwise one does ('8').
  const hourLen = digits.length >= 2 && Number(digits.slice(0, 2)) <= 12 ? 2 : 1;
  if (digits.length <= hourLen) return digits;
  return `${digits.slice(0, hourLen)}:${digits.slice(hourLen)}`;
}
