/**
 * Section ordering for the three public legal pages.
 *
 * Only the key order lives here — every string is in i18n/locales, because
 * these pages ship in English and Hindi like the rest of the product. Adding a
 * section means adding its key here and its `title`/`body` under
 * `legal.<page>.sections.<key>` in both locale files.
 *
 * `body` is one string per section; blank lines separate paragraphs and lines
 * beginning with "- " render as a list. Keeping it to two fields per section
 * is what makes translating the whole policy tractable.
 */

export const PRIVACY_SECTIONS = [
  'whoWeAre',
  'whatWeCollect',
  'howWeUse',
  'childrenData',
  'sharing',
  'security',
  'retention',
  'yourRights',
  'deletion',
  'cookies',
  'changes',
  'contact',
];

export const TERMS_SECTIONS = [
  'acceptance',
  'service',
  'accounts',
  'acceptableUse',
  'customerData',
  'fees',
  'availability',
  'intellectualProperty',
  'termination',
  'liability',
  'governingLaw',
  'changes',
  'contact',
];

export const DELETION_SECTIONS = [
  'whatHappens',
  'whatIsKept',
  'inApp',
  'onlyAdmin',
  'byEmail',
  'timeline',
  'contact',
];

export const LAST_UPDATED = '2026-09-12';
