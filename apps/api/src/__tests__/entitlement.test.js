import { classifyEntitlement } from '../utils/entitlement.js';
import { summarizePlan } from '../utils/planSummary.js';

const at = new Date('2026-05-15T10:00:00Z');
const plan = (status, from, to, extra = {}) => ({
  _id: `${status}-${from}`,
  status,
  coversFrom: new Date(from),
  coversTo: new Date(to),
  ...extra,
});

describe('classifyEntitlement', () => {
  test('a paid assignment that covers now is valid', () => {
    const r = classifyEntitlement([plan('paid', '2026-05-01', '2026-05-31T23:59:59Z')], at);
    expect(r.status).toBe('valid');
    expect(r.coversTo.toISOString()).toBe('2026-05-31T23:59:59.000Z');
  });

  test('a waived assignment counts as valid', () => {
    expect(classifyEntitlement([plan('waived', '2026-05-01', '2026-05-31')], at).status).toBe(
      'valid'
    );
  });

  test.each(['unpaid', 'partial'])('a covering assignment that is %s is unpaid', (status) => {
    expect(classifyEntitlement([plan(status, '2026-05-01', '2026-05-31')], at).status).toBe(
      'unpaid'
    );
  });

  test('a plan that ended is expired and says when', () => {
    const r = classifyEntitlement([plan('paid', '2026-04-01', '2026-04-30')], at);
    expect(r.status).toBe('expired');
    expect(r.coversTo.toISOString()).toBe('2026-04-30T00:00:00.000Z');
  });

  test('a plan that has not started yet is expired, not valid', () => {
    expect(classifyEntitlement([plan('paid', '2026-06-01', '2026-06-30')], at).status).toBe(
      'expired'
    );
  });

  test('no plan at all is none, and a school fee with no coverage does not count', () => {
    expect(classifyEntitlement([], at)).toEqual({ status: 'none', coversTo: null });
    expect(classifyEntitlement([{ status: 'paid' }], at).status).toBe('none');
  });

  test('a paid plan wins over an unpaid one covering the same moment', () => {
    const r = classifyEntitlement(
      [plan('unpaid', '2026-05-01', '2026-05-31'), plan('paid', '2026-05-10', '2026-05-20')],
      at
    );
    expect(r.status).toBe('valid');
  });

  test('an earlier paid plan does not rescue a later unpaid one that is now current', () => {
    const r = classifyEntitlement(
      [plan('paid', '2026-04-01', '2026-04-30'), plan('unpaid', '2026-05-01', '2026-05-31')],
      at
    );
    expect(r.status).toBe('unpaid');
  });

  test('a refunded plan (back to unpaid by the fee service) loses its validity', () => {
    expect(classifyEntitlement([plan('unpaid', '2026-05-01', '2026-05-31')], at).status).not.toBe(
      'valid'
    );
  });
});

describe('summarizePlan', () => {
  const names = new Map([['s1', 'Morning monthly']]);
  const assignment = (id, status, from, to, total, due) => ({
    _id: id,
    feeStructureId: 's1',
    status,
    totalAmount: total,
    discountAmount: 0,
    coversFrom: new Date(from),
    coversTo: new Date(to),
    dueDate: new Date(due),
  });

  test('shows the covering plan with its name and period', () => {
    const r = summarizePlan({
      assignments: [assignment('a1', 'paid', '2026-05-01', '2026-05-31', 1200, '2026-05-01')],
      payments: [{ assignmentId: 'a1', amount: 1200 }],
      structureNames: names,
      at,
    });
    expect(r.plan).toMatchObject({ name: 'Morning monthly' });
    expect(r.plan.coversTo.toISOString()).toBe('2026-05-31T00:00:00.000Z');
    expect(r.nextDue).toBeNull();
  });

  test('an expired plan still shows, the latest one', () => {
    const r = summarizePlan({
      assignments: [
        assignment('a1', 'paid', '2026-03-01', '2026-03-31', 1200, '2026-03-01'),
        assignment('a2', 'paid', '2026-04-01', '2026-04-30', 1200, '2026-04-01'),
      ],
      payments: [],
      structureNames: names,
      at,
    });
    expect(r.plan.coversTo.toISOString()).toBe('2026-04-30T00:00:00.000Z');
  });

  test('next due is the earliest owing assignment, net of discount and of non-refunded payments', () => {
    const a1 = assignment('a1', 'partial', '2026-05-01', '2026-05-31', 1200, '2026-05-01');
    a1.discountAmount = 200;
    const a2 = assignment('a2', 'unpaid', '2026-06-01', '2026-06-30', 1200, '2026-06-01');
    const r = summarizePlan({
      assignments: [a2, a1],
      payments: [
        { assignmentId: 'a1', amount: 300 },
        { assignmentId: 'a1', amount: 500, refunded: true },
      ],
      structureNames: names,
      at,
    });
    // 1200 - 200 discount - 300 paid (the refunded 500 does not count).
    expect(r.nextDue.amount).toBe(700);
    expect(r.nextDue.dueDate.toISOString()).toBe('2026-05-01T00:00:00.000Z');
  });

  test('nothing owing gives nextDue null; no plans gives plan null', () => {
    expect(summarizePlan({ assignments: [], payments: [], structureNames: names, at })).toEqual({
      plan: null,
      nextDue: null,
    });
  });
});
