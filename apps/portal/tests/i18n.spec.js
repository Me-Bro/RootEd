/**
 * R15: every string the portal shows goes through t() and exists in both English
 * and Hindi. No browser needed; this is a static check of the locale files
 * against the source.
 */
import { test, expect } from '@playwright/test';
import { readFileSync, readdirSync, statSync } from 'fs';
import path from 'path';

const SRC = path.join(import.meta.dirname, '../src');
const load = (name) =>
  JSON.parse(readFileSync(path.join(SRC, `i18n/locales/${name}.json`), 'utf8'));
const en = load('en');
const hi = load('hi');

function flatten(obj, prefix = '') {
  return Object.entries(obj).flatMap(([key, value]) =>
    typeof value === 'object' ? flatten(value, `${prefix}${key}.`) : [[`${prefix}${key}`, value]]
  );
}
const enFlat = Object.fromEntries(flatten(en));
const hiFlat = Object.fromEntries(flatten(hi));

const placeholders = (s) => [...s.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort();

function sourceFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return name === 'locales' ? [] : sourceFiles(full);
    return name.endsWith('.jsx') ? [full] : [];
  });
}
const files = sourceFiles(SRC);
const source = files.map((f) => readFileSync(f, 'utf8')).join('\n');

test('English and Hindi define exactly the same keys', () => {
  expect(Object.keys(hiFlat).sort()).toEqual(Object.keys(enFlat).sort());
});

test('each key has the same {{placeholders}} in both languages', () => {
  const mismatched = Object.keys(enFlat).filter(
    (k) => placeholders(enFlat[k]).join() !== placeholders(hiFlat[k]).join()
  );
  expect(mismatched).toEqual([]);
});

test('Hindi is actually translated (Devanagari, or a deliberate brand/symbol)', () => {
  const untranslated = Object.keys(hiFlat).filter((k) => {
    const value = hiFlat[k];
    if (/[ऀ-ॿ]/.test(value)) return false;
    if (['portal.brand', 'languages.en'].includes(k)) return false; // deliberately Latin
    // What is left once {{placeholders}} are removed must hold no words.
    return /[A-Za-z]/.test(value.replace(/\{\{\w+\}\}/g, ''));
  });
  expect(untranslated).toEqual([]);
});

test('every literal t("…") key used in the source exists', () => {
  const used = [...source.matchAll(/\bt\(\s*'([^']+)'/g)].map((m) => m[1]);
  const missing = [...new Set(used)].filter((k) => !(k in enFlat));
  expect(missing).toEqual([]);
});

test('every dynamic t(`prefix.${…}`) key has a matching group of strings', () => {
  const prefixes = [...source.matchAll(/\bt\(\s*`([^`$]+)\$\{/g)].map((m) => m[1]);
  const empty = [...new Set(prefixes)].filter(
    (p) => !Object.keys(enFlat).some((k) => k.startsWith(p))
  );
  expect(empty).toEqual([]);
});

test('the dynamic groups cover every value the API can send', () => {
  const need = {
    'training.stage.': ['applied', 'interviewed', 'offered', 'joined', 'rejected', 'withdrawn'],
    'training.status.': ['completed', 'active', 'dropped'],
    'training.assignments.status.': ['pending', 'submitted', 'reviewed'],
    'training.completion.decision.': ['completed', 'dropped', 'active'],
    'training.dashboard.': ['met', 'notMet', 'noData'],
    'me.assessmentTypes.': ['baseline', 'final', 'mock_interview', 'quiz', 'midterm', 'other'],
    'languages.': ['en', 'hi', 'hi_en'],
  };
  const gaps = Object.entries(need).flatMap(([prefix, values]) =>
    values.filter((v) => !(`${prefix}${v}` in enFlat)).map((v) => `${prefix}${v}`)
  );
  expect(gaps).toEqual([]);
});

test('no page hardcodes visible English text in JSX', () => {
  // Text directly between tags that is not a {expression}: <p>Some words</p>.
  const offenders = files.flatMap((file) => {
    const text = readFileSync(file, 'utf8');
    return [...text.matchAll(/>\s*([A-Z][a-z]+(?:\s+[a-z]+){1,}[^<{>]*)\s*</g)].map(
      (m) => `${path.basename(file)}: ${m[1].trim()}`
    );
  });
  expect(offenders).toEqual([]);
});
