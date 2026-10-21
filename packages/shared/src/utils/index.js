import { JOIN_CODE_PREFIX } from '../constants/index.js';

export * from './grading.js';
export * from './orgTypes.js';
export * from './placement.js';

/**
 * Normalises a typed join code to its stored form: uppercased, separators and
 * the display prefix stripped, and the Crockford foldings applied — I and L
 * read as 1, O reads as 0. This is what makes a code survive being copied off
 * a whiteboard.
 */
export function normalizeJoinCode(input) {
  return String(input ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .replace(new RegExp(`^${JOIN_CODE_PREFIX}`), '')
    .replace(/[IL]/g, '1')
    .replace(/O/g, '0');
}

/**
 * The API's sanitizeBody turns a typed `&`, `<` or `>` into an HTML entity.
 * Plain-text fields are shown through React, which escapes on its own, so put
 * the characters back rather than store "Arts &amp; Science" (or a URL whose
 * query string reads `&amp;`).
 */
export function unescapeText(value) {
  return typeof value === 'string'
    ? value.replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&amp;', '&')
    : value;
}
