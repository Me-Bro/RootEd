import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toParts, fromParts, maskTime } from './time12.js';

test('24-hour values split into a 12-hour text and a period', () => {
  assert.deepEqual(toParts('19:05'), { text: '07:05', period: 'PM' });
  assert.deepEqual(toParts('00:00'), { text: '12:00', period: 'AM' });
  assert.deepEqual(toParts('12:30'), { text: '12:30', period: 'PM' });
  assert.deepEqual(toParts('06:00'), { text: '06:00', period: 'AM' });
  assert.deepEqual(toParts(''), { text: '', period: null });
  assert.deepEqual(toParts(null), { text: '', period: null });
});

test('12-hour text and period join back into 24-hour', () => {
  assert.equal(fromParts('07:05', 'PM'), '19:05');
  assert.equal(fromParts('12:00', 'AM'), '00:00');
  assert.equal(fromParts('12:30', 'PM'), '12:30');
  assert.equal(fromParts('8:15', 'AM'), '08:15');
});

test('incomplete or impossible 12-hour text gives an empty value', () => {
  assert.equal(fromParts('', 'AM'), '');
  assert.equal(fromParts('8:', 'AM'), '');
  assert.equal(fromParts('13:00', 'AM'), '');
  assert.equal(fromParts('0:30', 'PM'), '');
  assert.equal(fromParts('08:60', 'AM'), '');
});

test('typing inserts the colon in the right place', () => {
  assert.equal(maskTime('8'), '8');
  assert.equal(maskTime('08'), '08');
  assert.equal(maskTime('083'), '08:3');
  assert.equal(maskTime('0830'), '08:30');
  assert.equal(maskTime('830'), '8:30');
  assert.equal(maskTime('1030'), '10:30');
  assert.equal(maskTime('13'), '1:3');
  assert.equal(maskTime('8:30pm'), '8:30');
  assert.equal(maskTime('123456'), '12:34');
});
