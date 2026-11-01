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

import { canApplyDiscount, sellablePlans, pickableDiscounts } from './studyCenter.js';

test('the owner may offer a discount under every policy', () => {
  for (const policy of ['owner', 'desk', 'staff']) {
    assert.equal(canApplyDiscount(policy, ['tenant:admin']), true);
  }
});

test('owner policy offers nobody else a discount', () => {
  assert.equal(canApplyDiscount('owner', ['fees:write', 'fees:collect']), false);
});

test('desk policy offers it to whoever collects, staff policy to whoever manages fees', () => {
  assert.equal(canApplyDiscount('desk', ['fees:collect']), true);
  assert.equal(canApplyDiscount('desk', ['fees:write']), false);
  assert.equal(canApplyDiscount('staff', ['fees:write']), true);
  assert.equal(canApplyDiscount('staff', ['fees:collect']), false);
  assert.equal(canApplyDiscount('anything', []), false);
});

test('only structures with a plan that are on sale are offered, by name', () => {
  const structures = [
    { name: 'Library', plan: undefined },
    { name: 'Monthly', plan: { kind: 'shift_plan' }, isActive: true },
    { name: 'Day pass', plan: { kind: 'day_pass' } },
    { name: 'Retired', plan: { kind: 'day_pass' }, isActive: false },
  ];
  assert.deepEqual(
    sellablePlans(structures).map((s) => s.name),
    ['Day pass', 'Monthly']
  );
});

test('only everyone-discounts inside their dates are pickable', () => {
  const now = new Date('2026-05-15');
  const discounts = [
    { name: 'B open', applicableTo: 'all' },
    { name: 'A window', applicableTo: 'all', validFrom: '2026-05-01', validTo: '2026-05-31' },
    { name: 'Expired', applicableTo: 'all', validTo: '2026-05-01' },
    { name: 'Future', applicableTo: 'all', validFrom: '2026-06-01' },
    { name: 'One learner', applicableTo: 'student', studentId: 's1' },
    { name: 'Class', applicableTo: 'class' },
  ];
  assert.deepEqual(
    pickableDiscounts(discounts, now).map((d) => d.name),
    ['A window', 'B open']
  );
});
