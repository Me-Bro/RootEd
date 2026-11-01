import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatShiftHours, learnersWithoutSeat } from './studyCenter.js';

test('shift hours show both ends, one end, or nothing', () => {
  assert.equal(formatShiftHours('06:00', '14:00'), '06:00–14:00');
  assert.equal(formatShiftHours('06:00', null), '06:00');
  assert.equal(formatShiftHours(undefined, '14:00'), '14:00');
  assert.equal(formatShiftHours(null, null), '');
});

test('learners without a seat leave out those who hold one, ordered by name', () => {
  const students = [
    { _id: 'a', firstName: 'Ravi', lastName: 'Kumar' },
    { _id: 'b', firstName: 'Asha', lastName: 'Rana' },
    { _id: 'c', firstName: 'Meena', lastName: 'Devi' },
  ];
  assert.deepEqual(
    learnersWithoutSeat(students, ['a']).map((s) => s._id),
    ['b', 'c']
  );
  assert.deepEqual(
    learnersWithoutSeat(students, []).map((s) => s._id),
    ['b', 'c', 'a']
  );
});

test('ids are compared as strings', () => {
  const students = [{ _id: 1, firstName: 'A', lastName: 'B' }];
  assert.deepEqual(learnersWithoutSeat(students, ['1']), []);
});
