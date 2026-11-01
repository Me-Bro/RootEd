import test from 'node:test';
import assert from 'node:assert/strict';
import { yearAssignment, sectionsForSubject } from './yearAssignment.js';

const terms = ['t1', 't2'];

test('finds the teacher in any term of the year', () => {
  const rows = [{ _id: 'r1', sectionId: 's1', termId: 't2', teacherId: 'alice' }];
  assert.deepEqual(yearAssignment(rows, 's1', terms), { teacherId: 'alice', rows });
});

test('the latest term wins when the terms disagree', () => {
  const rows = [
    { _id: 'r1', sectionId: 's1', termId: 't1', teacherId: 'alice' },
    { _id: 'r2', sectionId: 's1', termId: 't2', teacherId: 'bob' },
  ];
  const found = yearAssignment(rows, 's1', terms);
  assert.equal(found.teacherId, 'bob');
  assert.equal(found.rows.length, 2);
});

test('ignores other sections and terms outside the year', () => {
  const rows = [
    { _id: 'r1', sectionId: 's2', termId: 't1', teacherId: 'alice' },
    { _id: 'r2', sectionId: 's1', termId: 'old', teacherId: 'bob' },
  ];
  assert.equal(yearAssignment(rows, 's1', terms), null);
});

test('sectionsForSubject keeps the subject class, or every section for a classless subject', () => {
  const sections = [
    { _id: 'a', classId: 'c5' },
    { _id: 'b', classId: 'c6' },
  ];
  assert.deepEqual(
    sectionsForSubject({ classId: 'c5' }, sections).map((s) => s._id),
    ['a']
  );
  assert.equal(sectionsForSubject({}, sections), sections);
});
