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

export const fullName = (student) =>
  student ? `${student.firstName ?? ''} ${student.lastName ?? ''}`.trim() : DASH;

/** Case-insensitive "does this row mention the search text" over any number of fields. */
export const matchesQuery = (query, ...fields) =>
  fields.join(' ').toLowerCase().includes(query.trim().toLowerCase());
