import {
  canApplyAdHocDiscount,
  isWithinWindow,
  pickStandingDiscount,
} from '../utils/discountPolicy.js';
import { discountAppliesTo } from '../utils/feeCalculations.js';
import { buildReceiptLines } from '../utils/receiptLines.js';

const none = { admin: false, feesWrite: false, feesCollect: false };

describe('canApplyAdHocDiscount', () => {
  test('the owner may under every policy', () => {
    for (const policy of ['owner', 'desk', 'staff']) {
      expect(canApplyAdHocDiscount(policy, { ...none, admin: true })).toBe(true);
    }
  });

  test('owner policy refuses everyone else, even with fees:write and fees:collect', () => {
    expect(canApplyAdHocDiscount('owner', { ...none, feesWrite: true, feesCollect: true })).toBe(
      false
    );
  });

  test('desk policy lets whoever takes payments apply one, but not someone with neither', () => {
    expect(canApplyAdHocDiscount('desk', { ...none, feesCollect: true })).toBe(true);
    expect(canApplyAdHocDiscount('desk', { ...none, feesWrite: true })).toBe(false);
    expect(canApplyAdHocDiscount('desk', none)).toBe(false);
  });

  test('staff policy is today’s rule: fees:write, and fees:collect alone is not enough', () => {
    expect(canApplyAdHocDiscount('staff', { ...none, feesWrite: true })).toBe(true);
    expect(canApplyAdHocDiscount('staff', { ...none, feesCollect: true })).toBe(false);
  });

  test('an unknown policy is treated as owner-only', () => {
    expect(canApplyAdHocDiscount('anything', { ...none, feesWrite: true })).toBe(false);
  });
});

describe('isWithinWindow and discountAppliesTo(at)', () => {
  const at = new Date('2026-05-15T00:00:00Z');

  test('no window always applies', () => {
    expect(isWithinWindow({}, at)).toBe(true);
  });

  test('inside, before and after the window', () => {
    const d = { validFrom: new Date('2026-05-01'), validTo: new Date('2026-05-31') };
    expect(isWithinWindow(d, at)).toBe(true);
    expect(isWithinWindow(d, new Date('2026-04-30'))).toBe(false);
    expect(isWithinWindow(d, new Date('2026-06-01'))).toBe(false);
  });

  test('an expired discount is refused when a date is given (AC6)', () => {
    const discount = { applicableTo: 'all', validTo: new Date('2026-05-01') };
    expect(discountAppliesTo({ discount, assignment: {}, at })).toBe(false);
  });

  test('without a date, behavior is exactly what it was before windows existed', () => {
    const discount = { applicableTo: 'all', validTo: new Date('2000-01-01') };
    expect(discountAppliesTo({ discount, assignment: {} })).toBe(true);
    expect(
      discountAppliesTo({
        discount: { applicableTo: 'student', studentId: 'a' },
        assignment: { studentId: 'a' },
      })
    ).toBe(true);
    expect(
      discountAppliesTo({
        discount: { applicableTo: 'student', studentId: 'a' },
        assignment: { studentId: 'b' },
      })
    ).toBe(false);
  });
});

describe('pickStandingDiscount', () => {
  const at = new Date('2026-05-15T00:00:00Z');
  const base = (over) => ({
    applicableTo: 'student',
    studentId: 's1',
    type: 'percentage',
    value: 10,
    validTo: new Date('2026-12-31'),
    ...over,
  });

  test('picks the learner’s valid discount', () => {
    const d = base({ name: 'ten' });
    expect(pickStandingDiscount({ discounts: [d], studentId: 's1', at, baseAmount: 1000 })).toBe(d);
  });

  test('ignores an expired one, another learner’s, and a non-student scope', () => {
    const discounts = [
      base({ validTo: new Date('2026-05-01') }),
      base({ studentId: 's2' }),
      base({ applicableTo: 'all' }),
    ];
    expect(pickStandingDiscount({ discounts, studentId: 's1', at, baseAmount: 1000 })).toBeNull();
  });

  test('with several valid, the largest in money wins (one discount per assignment)', () => {
    const small = base({ name: 'small', type: 'flat', value: 50 });
    const big = base({ name: 'big', type: 'percentage', value: 20 });
    expect(
      pickStandingDiscount({ discounts: [small, big], studentId: 's1', at, baseAmount: 1000 })
    ).toBe(big);
    expect(
      pickStandingDiscount({ discounts: [small, big], studentId: 's1', at, baseAmount: 100 })
    ).toBe(small);
  });
});

describe('buildReceiptLines', () => {
  const base = {
    receiptNumber: 'RCP-2026-00001',
    paymentDate: new Date('2026-05-11T05:00:00Z'),
    student: { firstName: 'Asha', lastName: 'Rana', admissionNo: 'SC-001' },
    amount: 1200,
    paymentMethod: 'upi',
  };

  test('uses the tenant’s own name and never the old fixed school name', () => {
    const r = buildReceiptLines({ ...base, tenantName: 'Quiet Corner Study Centre' });
    expect(r.organization).toBe('Quiet Corner Study Centre');
    expect(r.lines.join('\n')).not.toMatch(/RootEd School/);
  });

  test('no tenant name gives no organization line', () => {
    expect(buildReceiptLines(base).organization).toBeNull();
  });

  test('a plan sale shows the plan and its period; a day pass shows one date', () => {
    const month = buildReceiptLines({
      ...base,
      planName: 'Morning monthly',
      coversFrom: new Date('2026-05-10T18:30:00Z'),
      coversTo: new Date('2026-06-10T18:29:59.999Z'),
    });
    expect(month.lines).toContain('Plan: Morning monthly');
    expect(month.lines.join('\n')).toMatch(/Valid: 11 May 2026 to 10 Jun 2026/);

    const day = buildReceiptLines({
      ...base,
      planName: 'Day pass',
      coversFrom: new Date('2026-05-10T18:30:00Z'),
      coversTo: new Date('2026-05-11T18:29:59.999Z'),
    });
    expect(day.lines.join('\n')).toMatch(/Valid on: 11 May 2026/);
  });

  test('an ordinary fee receipt has no plan lines', () => {
    const r = buildReceiptLines({ ...base, tenantName: 'Test School' });
    expect(r.lines.join('\n')).not.toMatch(/Plan:|Valid/);
    expect(r.lines).toContain('Amount Paid: 1200');
  });

  test('a transaction id is included only when there is one', () => {
    expect(buildReceiptLines({ ...base, transactionId: 'T123' }).lines).toContain(
      'Transaction ID: T123'
    );
    expect(buildReceiptLines(base).lines.join('\n')).not.toMatch(/Transaction/);
  });
});
