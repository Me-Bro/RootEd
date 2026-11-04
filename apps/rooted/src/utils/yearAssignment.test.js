import test from 'node:test';
import assert from 'node:assert/strict';
import {
  yearAssignment,
  sectionsForSubject,
  teacherNamesOfSubject,
  teacherSummary,
} from './yearAssignment.js';

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

const nameById = new Map([
  ['alice', 'Alice Smith'],
  ['bob', 'Bob Jones'],
]);
const row = (subjectId, sectionId, termId, teacherId, teacher) => ({
  subjectId,
  sectionId,
  termId,
  teacherId,
  teacher: teacher ?? null,
});
const names = (rows, subjectId = 'maths') =>
  teacherNamesOfSubject(rows, subjectId, terms, nameById);

test("a subject's teachers are the distinct people across its sections, by name", () => {
  const rows = [row('maths', 's1', 't1', 'bob'), row('maths', 's2', 't1', 'alice')];
  assert.deepEqual(names(rows), ['Alice Smith', 'Bob Jones']);
});

test('the same teacher in two sections or two terms is listed once', () => {
  const rows = [
    row('maths', 's1', 't1', 'alice'),
    row('maths', 's1', 't2', 'alice'),
    row('maths', 's2', 't1', 'alice'),
  ];
  assert.deepEqual(names(rows), ['Alice Smith']);
});

test('other subjects and terms outside the year are ignored', () => {
  const rows = [row('science', 's1', 't1', 'bob'), row('maths', 's1', 'old', 'bob')];
  assert.deepEqual(names(rows), []);
});

test("when a section's terms disagree only the latest term's teacher counts", () => {
  const rows = [row('maths', 's1', 't1', 'bob'), row('maths', 's1', 't2', 'alice')];
  assert.deepEqual(names(rows), ['Alice Smith']);
});

test('nobody assigned gives an empty list', () => {
  assert.deepEqual(names([]), []);
});

test('the staff directory names the person; the user record is only a fallback', () => {
  // Not in the directory (never added as staff): fall back to the account's name, then its email.
  const rows = [
    row('maths', 's1', 't1', 'zed', { firstName: 'Zed', lastName: 'Khan', email: 'z@s.test' }),
    row('maths', 's2', 't1', 'yan', { email: 'yan@s.test' }),
    row('maths', 's3', 't1', 'gone', null),
  ];
  assert.deepEqual(names(rows), ['yan@s.test', 'Zed Khan']);
});

test('a summary shows the first two names and counts the rest', () => {
  assert.deepEqual(teacherSummary(['A']), { names: ['A'], more: 0 });
  assert.deepEqual(teacherSummary(['A', 'B']), { names: ['A', 'B'], more: 0 });
  assert.deepEqual(teacherSummary(['A', 'B', 'C', 'D']), { names: ['A', 'B'], more: 2 });
  assert.deepEqual(teacherSummary([]), { names: [], more: 0 });
});
