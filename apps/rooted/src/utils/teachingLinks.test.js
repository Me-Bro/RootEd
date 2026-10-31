import test from 'node:test';
import assert from 'node:assert/strict';
import { classLinks, mySectionIds } from './teachingLinks.js';

test('classLinks carries the section and, when there is one, the subject', () => {
  assert.deepEqual(classLinks({ sectionId: 's1', subjectId: 'm1' }), {
    attendance: '/academic/attendance?sectionId=s1',
    grades: '/academic/grades?sectionId=s1&subjectId=m1',
    students: '/academic/students?sectionId=s1',
  });
});

test('classLinks leaves the subject out for a class-teacher row', () => {
  assert.equal(
    classLinks({ sectionId: 's1', subjectId: null }).grades,
    '/academic/grades?sectionId=s1'
  );
});

test('mySectionIds de-duplicates sections taught in several subjects', () => {
  const ids = mySectionIds([{ sectionId: 'a' }, { sectionId: 'a' }, { sectionId: 'b' }]);
  assert.deepEqual([...ids].sort(), ['a', 'b']);
});
