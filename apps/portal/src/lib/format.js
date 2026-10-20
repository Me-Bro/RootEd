export const DASH = '—';

/** A percentage, or a dash where there was nothing to measure (never "0%"). */
export const fmtPct = (value) => (value === null || value === undefined ? DASH : `${value}%`);

export const fmtNum = (value) => (value === null || value === undefined ? DASH : String(value));

export function fmtDate(value, locale) {
  if (!value) return DASH;
  return new Date(value).toLocaleDateString(locale || undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

/** `2026-11-05` for an <input type="date">. */
export const toDateInput = (value) => (value ? new Date(value).toISOString().slice(0, 10) : '');

export const fullName = (student) =>
  student ? `${student.firstName ?? ''} ${student.lastName ?? ''}`.trim() : DASH;
