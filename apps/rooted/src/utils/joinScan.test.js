import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkInTokenFromScan, codeFromScan } from './joinScan.js';

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

test('reads the check-in token out of a centre QR link, and ignores anything else', () => {
  assert.equal(checkInTokenFromScan('https://c.example.com/me/scan?t=abc123'), 'abc123');
  assert.equal(checkInTokenFromScan('https://c.example.com/orgs/join?code=RTED-ABCDE-FGH23'), null);
  assert.equal(checkInTokenFromScan('https://c.example.com/me/scan'), null);
  assert.equal(checkInTokenFromScan('not a url'), null);
});
