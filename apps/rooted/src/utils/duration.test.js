import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatDuration } from './duration.js';

test('minutes only, hours only, and both', () => {
  assert.equal(formatDuration(0), '0m');
  assert.equal(formatDuration(45), '45m');
  assert.equal(formatDuration(120), '2h');
  assert.equal(formatDuration(150), '2h 30m');
});

test('rounds to whole minutes', () => {
  assert.equal(formatDuration(59.6), '1h');
});

test('anything that is not a length of time is a dash', () => {
  for (const v of [null, undefined, '12', NaN, -5, Infinity]) assert.equal(formatDuration(v), '—');
});
