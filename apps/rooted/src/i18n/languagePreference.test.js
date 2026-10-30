import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isValidLanguage, SUPPORTED_LANGUAGES } from './languagePreference.js';

test('accepts every supported language code', () => {
  for (const lang of SUPPORTED_LANGUAGES) {
    assert.equal(isValidLanguage(lang), true);
  }
});

test('rejects unknown or malformed values', () => {
  assert.equal(isValidLanguage('fr'), false);
  assert.equal(isValidLanguage(''), false);
  assert.equal(isValidLanguage(null), false);
  assert.equal(isValidLanguage(undefined), false);
});
