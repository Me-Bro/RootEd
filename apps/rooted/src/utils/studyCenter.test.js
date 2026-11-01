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

import { splitMinutes, localDayString, localMonthString, daysAgoString } from './studyCenter.js';

test('minutes split into hours and minutes, never negative', () => {
  assert.deepEqual(splitMinutes(290), { hours: 4, minutes: 50 });
  assert.deepEqual(splitMinutes(45), { hours: 0, minutes: 45 });
  assert.deepEqual(splitMinutes(120), { hours: 2, minutes: 0 });
  assert.deepEqual(splitMinutes(0), { hours: 0, minutes: 0 });
  assert.deepEqual(splitMinutes(-5), { hours: 0, minutes: 0 });
  assert.deepEqual(splitMinutes(59.6), { hours: 1, minutes: 0 });
});

test('local day and month strings use the browser clock, zero padded', () => {
  const d = new Date(2026, 4, 5, 23, 30); // 5 May 2026, local
  assert.equal(localDayString(d), '2026-05-05');
  assert.equal(localMonthString(d), '2026-05');
});

test('days ago crosses month and year ends', () => {
  assert.equal(daysAgoString(29, new Date(2026, 4, 20)), '2026-04-21');
  assert.equal(daysAgoString(1, new Date(2026, 0, 1)), '2025-12-31');
  assert.equal(daysAgoString(0, new Date(2026, 4, 20)), '2026-05-20');
});

import { apiError } from './studyCenter.js';

test('apiError prefers a field message, then the server message, then the fallback', () => {
  const withDetails = {
    response: { data: { error: 'Validation error', details: { phone: ['Enter a valid mobile'] } } },
  };
  assert.equal(apiError(withDetails, 'fallback'), 'Enter a valid mobile');
  assert.equal(
    apiError({ response: { data: { error: 'Seat is taken' } } }, 'fallback'),
    'Seat is taken'
  );
  assert.equal(apiError({ response: { data: { details: {} } } }, 'fallback'), 'fallback');
  assert.equal(apiError(new Error('network'), 'fallback'), 'fallback');
  assert.equal(apiError(undefined, 'fallback'), 'fallback');
});
