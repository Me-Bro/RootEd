// A cell that opens with one of these is run as a formula by Excel/Sheets, so a
// student named "=HYPERLINK(...)" would execute on the trainer's machine. Strings
// get a leading apostrophe; real numbers (a "-5" improvement) are left alone.
const FORMULA_START = /^[=+\-@\t\r]/;

function cell(value) {
  if (value === null || value === undefined) return '';
  let text = String(value);
  if (typeof value === 'string' && FORMULA_START.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export const toCsv = (headers, rows) =>
  [headers, ...rows].map((row) => row.map(cell).join(',')).join('\r\n');

/** Saves a CSV the browser's way. The BOM makes Excel read Hindi names as UTF-8. */
export function downloadCsv(filename, headers, rows) {
  const blob = new Blob(['﻿', toCsv(headers, rows)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
