import { test } from 'node:test';
import assert from 'node:assert/strict';
import { codeFromScan } from './joinScan.js';

test('reads the code out of a join link', () => {
  assert.equal(
    codeFromScan('https://rooted.example.com/orgs/join?code=RTED-ABCDE-FGH23'),
    'RTED-ABCDE-FGH23'
  );
});

test('accepts a bare code in any case and spacing', () => {
  assert.equal(codeFromScan('  rted abcde fgh23 '), 'RTED-ABCDE-FGH23');
});

test('ignores a QR code that is not a join code', () => {
  assert.equal(codeFromScan('https://example.com/menu'), null);
  assert.equal(codeFromScan('hello'), null);
  assert.equal(codeFromScan(''), null);
  assert.equal(codeFromScan('x'.repeat(500)), null);
});
