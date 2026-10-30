import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildHiEnResource } from './mergeHiEn.js';

test('combines matching leaf strings as "hi / en"', () => {
  const en = { save: 'Save', cancel: 'Cancel' };
  const hi = { save: 'सहेजें', cancel: 'रद्द करें' };
  assert.deepEqual(buildHiEnResource(en, hi), {
    save: 'सहेजें / Save',
    cancel: 'रद्द करें / Cancel',
  });
});

test('falls back to plain english when a hi key is missing', () => {
  const en = { save: 'Save', cancel: 'Cancel' };
  const hi = { save: 'सहेजें' };
  assert.deepEqual(buildHiEnResource(en, hi), {
    save: 'सहेजें / Save',
    cancel: 'Cancel',
  });
});

test('falls back to plain english when hi resource is entirely absent', () => {
  const en = { save: 'Save' };
  assert.deepEqual(buildHiEnResource(en, undefined), { save: 'Save' });
});

test('recurses through nested namespaces', () => {
  const en = { nav: { dashboard: 'Dashboard' }, auth: { login: 'Login' } };
  const hi = { nav: { dashboard: 'डैशबोर्ड' } };
  assert.deepEqual(buildHiEnResource(en, hi), {
    nav: { dashboard: 'डैशबोर्ड / Dashboard' },
    auth: { login: 'Login' },
  });
});
