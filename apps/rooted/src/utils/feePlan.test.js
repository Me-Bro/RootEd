import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_BACKDATE_DAYS,
  earliestStartDay,
  splitFeeStructures,
  cyclePrice,
  cycleStartText,
  dayText,
  planActions,
  assignmentRow,
  statusTransitions,
  entitlementKey,
} from './feePlan.js';

test('the earliest start day is 31 days back', () => {
  assert.equal(MAX_BACKDATE_DAYS, 31);
  assert.equal(earliestStartDay(new Date(2027, 3, 10)), '2027-03-10');
  assert.equal(earliestStartDay(new Date(2027, 2, 1)), '2027-01-29');
});

test('structures split into cycle plans and one-offs; sold plans and inactive ones are left out', () => {
  const { cyclePlans, oneOffs } = splitFeeStructures([
    { name: 'Weekly', cycle: 'weekly' },
    { name: 'Monthly', cycle: 'monthly' },
    { name: 'Registration' },
    { name: 'Locker' },
    { name: 'Day pass', plan: { kind: 'day_pass' } },
    { name: 'Old monthly', cycle: 'monthly', isActive: false },
  ]);
  assert.deepEqual(
    cyclePlans.map((s) => s.name),
    ['Monthly', 'Weekly']
  );
  assert.deepEqual(
    oneOffs.map((s) => s.name),
    ['Locker', 'Registration']
  );
});

test('the price of a cycle skips optional components', () => {
  assert.equal(
    cyclePrice({
      components: [{ amount: 1200 }, { amount: 300 }, { amount: 500, isOptional: true }],
    }),
    1500
  );
  assert.equal(cyclePrice({}), 0);
});

test('cycle labels do not shift with the timezone', () => {
  assert.equal(cycleStartText('monthly', '2027-03-01', 'en-IN'), 'Mar 2027');
  assert.equal(cycleStartText('weekly', '2027-03-15', 'en-IN'), '15 Mar');
  assert.equal(dayText('2027-03-17', 'en-IN'), '17 Mar 2027');
  assert.equal(dayText(null), '');
});

test('an ordinary assignment row behaves as before', () => {
  assert.deepEqual(assignmentRow({ status: 'partial', balanceDue: 700 }), {
    status: 'partial',
    payable: 700,
    canCollect: true,
    canAdjust: true,
  });
  for (const status of ['paid', 'waived']) {
    const row = assignmentRow({ status, balanceDue: 0 });
    assert.equal(row.canCollect, false);
    assert.equal(row.canAdjust, false);
  }
});

test('a fee plan row: unpaid while overdue, payable ahead, never waived or discounted', () => {
  const owing = assignmentRow({
    status: 'unpaid', // never kept up to date for a plan
    balanceDue: 1500,
    ledger: { overdue: 1500, payableNow: 3000 },
  });
  assert.deepEqual(owing, { status: 'unpaid', payable: 3000, canCollect: true, canAdjust: false });

  const ahead = assignmentRow({ ledger: { overdue: 0, payableNow: 1500 } });
  assert.equal(ahead.status, 'paid');
  assert.equal(ahead.canCollect, true);

  const clear = assignmentRow({ ledger: { overdue: 0, payableNow: 0 } });
  assert.equal(clear.canCollect, false);
});

test('pause is offered while billing runs, resume while paused', () => {
  assert.deepEqual(planActions({ state: 'active' }), { canPause: true, canResume: false });
  assert.deepEqual(planActions({ state: 'paused' }), { canPause: false, canResume: true });
  for (const state of ['scheduled', 'ended', 'none']) {
    assert.deepEqual(planActions({ state }), { canPause: false, canResume: false });
  }
  assert.deepEqual(planActions(null), { canPause: false, canResume: false });
});

test('a study center offers withdraw but never graduate', () => {
  assert.deepEqual(
    statusTransitions('active', true).map((t) => t.to),
    ['withdrawn']
  );
  assert.deepEqual(
    statusTransitions('active', false).map((t) => t.to),
    ['graduated', 'withdrawn']
  );
});

test('a graduated or withdrawn learner can always be reactivated', () => {
  for (const seats of [true, false]) {
    assert.deepEqual(
      statusTransitions('graduated', seats).map((t) => t.to),
      ['active']
    );
    assert.deepEqual(
      statusTransitions('withdrawn', seats).map((t) => t.to),
      ['active']
    );
  }
  assert.deepEqual(statusTransitions('mystery', true), []);
});

test('unknown entitlement statuses fall back to a neutral label', () => {
  assert.equal(entitlementKey('paused'), 'paused');
  assert.equal(entitlementKey('scheduled'), 'scheduled');
  assert.equal(entitlementKey('whatever'), 'none');
});
