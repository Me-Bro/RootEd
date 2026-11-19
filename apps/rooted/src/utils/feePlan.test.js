import test from 'node:test';
import assert from 'node:assert/strict';
import {
  earliestStartDay,
  splitFeeStructures,
  cyclePrice,
  cycleStartText,
  dayText,
  planActions,
  assignmentRow,
  statusTransitions,
} from './feePlan.js';
import { MAX_BACKDATE_DAYS } from '@rooted/shared/schemas';

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

import { ENTITLEMENT_VARIANT, planHistory, discountStatus } from './feePlan.js';

test('planHistory lists stretches, pauses and the end, newest first', () => {
  const plan = {
    segments: [
      { name: 'Monthly', cycle: 'monthly', amount: 1500, from: '2027-01-01', to: '2027-03-01' },
      { name: 'Weekly', cycle: 'weekly', amount: 400, from: '2027-03-01', to: null },
    ],
    pauses: [{ from: '2027-02-10', to: '2027-02-20' }],
    endedOn: null,
  };
  assert.deepEqual(
    planHistory(plan).map((r) => [r.kind, r.from]),
    [
      ['plan', '2027-03-01'],
      ['pause', '2027-02-10'],
      ['plan', '2027-01-01'],
    ]
  );
});

test('planHistory shows the end, ahead of anything else on the same day', () => {
  const rows = planHistory({
    segments: [{ name: 'M', cycle: 'monthly', amount: 1, from: '2027-01-01', to: '2027-04-01' }],
    pauses: [{ from: '2027-04-01', to: null }],
    endedOn: '2027-04-01',
  });
  assert.deepEqual(
    rows.map((r) => r.kind),
    ['ended', 'pause', 'plan']
  );
});

test('planHistory of no plan, or a plan with nothing recorded, is empty', () => {
  assert.deepEqual(planHistory(null), []);
  assert.deepEqual(planHistory({}), []);
});

test('discountStatus compares the dates with now; no dates is always active', () => {
  const now = new Date('2027-03-15T00:00:00Z');
  assert.equal(discountStatus({}, now), 'active');
  assert.equal(discountStatus({ validFrom: '2027-03-01', validTo: '2027-03-31' }, now), 'active');
  assert.equal(discountStatus({ validFrom: '2027-04-01' }, now), 'upcoming');
  assert.equal(discountStatus({ validTo: '2027-03-01' }, now), 'ended');
});

test('every entitlement status has a badge colour', () => {
  for (const s of ['valid', 'unpaid', 'expired', 'none', 'paused', 'ended', 'scheduled']) {
    assert.ok(ENTITLEMENT_VARIANT[s], s);
  }
});
