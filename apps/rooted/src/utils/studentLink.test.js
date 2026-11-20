import test from 'node:test';
import assert from 'node:assert/strict';
import { studentBack, studentLink } from './studentLink.js';

const roster = { path: '/academic/students', labelKey: 'academic.studentDetail.backToList' };

test('a link carries its origin and opens the overview by default', () => {
  assert.deepEqual(studentLink('s1', { from: 'desk' }), {
    to: '/academic/students/s1',
    state: { from: 'desk' },
  });
});

test('a link can open a tab', () => {
  assert.equal(
    studentLink('s1', { from: 'fees', tab: 'billing' }).to,
    '/academic/students/s1?tab=billing'
  );
});

test('an unknown origin is dropped', () => {
  assert.equal(studentLink('s1', { from: 'elsewhere' }).state, undefined);
  assert.equal(studentLink('s1').state, undefined);
});

test('the back link returns to the desk or fees page it came from', () => {
  assert.deepEqual(studentBack({ from: 'desk' }, roster), {
    to: '/desk',
    labelKey: 'studyCenter.desk.backToDesk',
  });
  assert.deepEqual(studentBack({ from: 'fees' }, roster), {
    to: '/fee',
    labelKey: 'fee.collection.backToFees',
  });
});

test('with no usable origin the back link is the roster', () => {
  assert.deepEqual(studentBack(null, roster), { to: roster.path, labelKey: roster.labelKey });
  assert.deepEqual(studentBack({ from: '/evil' }, roster), {
    to: roster.path,
    labelKey: roster.labelKey,
  });
  assert.deepEqual(studentBack({ justAdded: {} }, roster), {
    to: roster.path,
    labelKey: roster.labelKey,
  });
});
