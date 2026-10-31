import test from 'node:test';
import assert from 'node:assert/strict';
import { subjectsForSection } from './subjectsForSection.js';

const subjects = [{ _id: 'm5', classId: 'c5' }, { _id: 'm6', classId: 'c6' }, { _id: 'pt' }];

test('keeps the section class subjects and the ones with no class', () => {
  const ids = subjectsForSection(subjects, { classId: 'c5' }).map((s) => s._id);
  assert.deepEqual(ids, ['m5', 'pt']);
});

test('drops subjects of another class', () => {
  const ids = subjectsForSection(subjects, { classId: 'c6' }).map((s) => s._id);
  assert.deepEqual(ids, ['m6', 'pt']);
});

test('no section yet keeps everything', () => {
  assert.equal(subjectsForSection(subjects, undefined), subjects);
});

test('compares ids as strings', () => {
  const ids = subjectsForSection([{ _id: 'a', classId: { toString: () => 'c5' } }], {
    classId: 'c5',
  }).map((s) => s._id);
  assert.deepEqual(ids, ['a']);
});
