import {
  cyclesBetween,
  buildLedger,
  validateStartDay,
  billingEntitlement,
  settledSpan,
  isBillingAssignment,
  dayKeyOf,
  dayStringOf,
} from '../utils/billingCycle.js';
import { dayStringInTz } from '../utils/dayKey.js';

const STUDENT = '65a000000000000000000001';
const day = (s) => new Date(`${s}T00:00:00Z`); // stored day keys are UTC-midnight Dates

const monthly = (from, extra = {}) => ({
  segments: [{ feeStructureId: 'm', cycle: 'monthly', amount: 1500, from: day(from) }],
  pauses: [],
  ...extra,
});

const discount = (fields) => ({
  applicableTo: 'student',
  studentId: STUDENT,
  ...fields,
});

const ledgerOf = (billing, today, { discounts = [], payments = [] } = {}) =>
  buildLedger({ billing, discounts, payments, today, studentId: STUDENT });

describe('cyclesBetween', () => {
  test('monthly cycles are calendar months, end exclusive', () => {
    expect(cyclesBetween({ cycle: 'monthly', fromDay: '2027-03-17', toDay: '2027-05-02' })).toEqual(
      [
        { start: '2027-03-01', end: '2027-04-01' },
        { start: '2027-04-01', end: '2027-05-01' },
        { start: '2027-05-01', end: '2027-06-01' },
      ]
    );
  });

  test('weekly cycles start on Monday', () => {
    // 2027-03-17 is a Wednesday.
    expect(cyclesBetween({ cycle: 'weekly', fromDay: '2027-03-17', toDay: '2027-03-23' })).toEqual([
      { start: '2027-03-15', end: '2027-03-22' },
      { start: '2027-03-22', end: '2027-03-29' },
    ]);
  });

  test('crosses a year end', () => {
    expect(
      cyclesBetween({ cycle: 'monthly', fromDay: '2027-12-20', toDay: '2028-01-05' }).map(
        (c) => c.start
      )
    ).toEqual(['2027-12-01', '2028-01-01']);
  });
});

describe('buildLedger: proration', () => {
  test('AC1: monthly 1500 from 17 Mar bills 15 of 31 days, due 31 Mar', () => {
    const ledger = ledgerOf(monthly('2027-03-17'), '2027-04-10');
    const march = ledger.cycles[0];
    expect(march).toMatchObject({
      start: '2027-03-01',
      end: '2027-04-01',
      dueOn: '2027-03-31',
      daysInCycle: 31,
      activeDays: 15,
      charge: 726,
      discount: 0,
      net: 726,
      phase: 'closed',
    });
    expect(ledger.cycles[1]).toMatchObject({ start: '2027-04-01', phase: 'current', net: 1500 });
    expect(ledger.overdue).toBe(726);
  });

  test('AC2: paused 5 Apr, resumed 20 Apr bills 15 of 30 April days', () => {
    const billing = monthly('2027-03-17', {
      pauses: [{ from: day('2027-04-05'), to: day('2027-04-20') }],
    });
    const april = ledgerOf(billing, '2027-05-03').cycles.find((c) => c.start === '2027-04-01');
    expect(april).toMatchObject({ activeDays: 15, daysInCycle: 30, charge: 750, phase: 'closed' });
  });

  test('EH1: leap February is 29 days; a full month is the full amount', () => {
    const ledger = ledgerOf(monthly('2028-02-01'), '2028-03-05');
    expect(ledger.cycles[0]).toMatchObject({ daysInCycle: 29, activeDays: 29, charge: 1500 });
  });

  test('EH1: half of a 28-day February', () => {
    const ledger = ledgerOf(monthly('2027-02-15'), '2027-03-05');
    expect(ledger.cycles[0]).toMatchObject({ daysInCycle: 28, activeDays: 14, charge: 750 });
  });

  test('EH2: a pause across a month boundary splits the unbilled days', () => {
    const billing = monthly('2027-03-01', {
      pauses: [{ from: day('2027-03-25'), to: day('2027-04-03') }],
    });
    const [march, april] = ledgerOf(billing, '2027-05-02').cycles;
    expect(march.activeDays).toBe(24); // 1-24 March
    expect(april.activeDays).toBe(28); // 3-30 April
  });

  test('EH3: joining on the last day of a month bills one day', () => {
    const ledger = ledgerOf(monthly('2027-03-31'), '2027-04-02');
    expect(ledger.cycles[0]).toMatchObject({ activeDays: 1, charge: 48 }); // 1500/31
  });

  test('weekly: a Wednesday join bills 5 of 7 days', () => {
    const billing = {
      segments: [{ feeStructureId: 'w', cycle: 'weekly', amount: 400, from: day('2027-03-17') }],
      pauses: [],
    };
    const ledger = ledgerOf(billing, '2027-03-23');
    expect(ledger.cycles[0]).toMatchObject({
      start: '2027-03-15',
      dueOn: '2027-03-21',
      activeDays: 5,
      charge: 286,
      phase: 'closed',
    });
    expect(ledger.cycles[1]).toMatchObject({ start: '2027-03-22', phase: 'current' });
  });

  test('ending billing mid-cycle prorates the last cycle and adds nothing after it', () => {
    const billing = monthly('2027-03-01', { endedOn: day('2027-04-16') });
    const ledger = ledgerOf(billing, '2027-06-10');
    expect(ledger.cycles.map((c) => c.start)).toEqual(['2027-03-01', '2027-04-01']);
    expect(ledger.cycles[1]).toMatchObject({ activeDays: 15, charge: 750 });
    expect(ledger.state).toBe('ended');
  });

  test('EH6: a structure change mid-month prorates both structures', () => {
    const billing = {
      segments: [
        {
          feeStructureId: 'm',
          cycle: 'monthly',
          amount: 1500,
          from: day('2027-03-01'),
          to: day('2027-04-10'),
        },
        { feeStructureId: 'w', cycle: 'weekly', amount: 400, from: day('2027-04-10') },
      ],
      pauses: [],
    };
    const ledger = ledgerOf(billing, '2027-04-20');
    const rows = ledger.cycles.map((c) => [c.feeStructureId, c.start, c.activeDays]);
    expect(rows).toEqual([
      ['m', '2027-03-01', 31],
      ['m', '2027-04-01', 9],
      ['w', '2027-04-05', 2], // Sat 10, Sun 11 April
      ['w', '2027-04-12', 7],
      ['w', '2027-04-19', 7],
    ]);
    expect(ledger.cycles[1].charge).toBe(450); // 1500 x 9/30
  });
});

describe('buildLedger: discounts', () => {
  test('AC3: a 10% standing discount applies to each prorated cycle', () => {
    const discounts = [discount({ type: 'percentage', value: 10, validTo: day('2030-01-01') })];
    const [march, april] = ledgerOf(monthly('2027-03-17'), '2027-05-02', { discounts }).cycles;
    expect(march).toMatchObject({ charge: 726, discount: 73, net: 653 });
    expect(april).toMatchObject({ charge: 1500, discount: 150, net: 1350 });
  });

  test('a flat discount is scaled by the active days', () => {
    const discounts = [discount({ type: 'flat', value: 200, validTo: day('2030-01-01') })];
    const march = ledgerOf(monthly('2027-03-17'), '2027-04-02', { discounts }).cycles[0];
    expect(march).toMatchObject({ charge: 726, discount: 97, net: 629 });
  });

  test('a discount applies only to cycles inside its window', () => {
    const discounts = [
      discount({
        type: 'percentage',
        value: 10,
        validFrom: day('2027-04-01'),
        validTo: day('2027-04-30'),
      }),
    ];
    const cycles = ledgerOf(monthly('2027-03-01'), '2027-05-20', { discounts }).cycles;
    expect(cycles.map((c) => c.discount)).toEqual([0, 150, 0]);
  });

  test('a discount starting on the join day applies to the first part-month', () => {
    const discounts = [
      discount({
        type: 'percentage',
        value: 10,
        validFrom: day('2027-03-17'),
        validTo: day('2030-01-01'),
      }),
    ];
    const march = ledgerOf(monthly('2027-03-17'), '2027-04-02', { discounts }).cycles[0];
    expect(march.discount).toBe(73);
  });

  test("another learner's discount is ignored", () => {
    const discounts = [
      { applicableTo: 'student', studentId: '65a000000000000000000099', type: 'flat', value: 500 },
    ];
    expect(ledgerOf(monthly('2027-03-01'), '2027-04-02', { discounts }).cycles[0].discount).toBe(0);
  });
});

describe('buildLedger: payments', () => {
  test('payments settle the oldest cycle first', () => {
    const ledger = ledgerOf(monthly('2027-03-17'), '2027-05-02', {
      payments: [{ amount: 1000 }],
    });
    const [march, april] = ledger.cycles;
    expect(march).toMatchObject({ paid: 726, status: 'paid' });
    expect(april).toMatchObject({ paid: 274, status: 'partial' });
    expect(ledger.overdue).toBe(1226);
    expect(ledger.nextDue).toEqual({ amount: 1226, dueOn: '2027-04-30' });
  });

  test('AC4: a payment before the cycle ends settles the current cycle; excess is credit', () => {
    const ledger = ledgerOf(monthly('2027-03-01'), '2027-03-02', {
      payments: [{ amount: 2000 }],
    });
    expect(ledger.cycles).toHaveLength(1);
    expect(ledger.cycles[0]).toMatchObject({ phase: 'current', status: 'paid', paid: 1500 });
    expect(ledger.overdue).toBe(0);
    expect(ledger.credit).toBe(500);
    expect(ledger.payableNow).toBe(0);
    expect(ledger.nextDue).toBeNull();

    // When April opens, the credit lands on it first.
    const later = ledgerOf(monthly('2027-03-01'), '2027-04-02', { payments: [{ amount: 2000 }] });
    expect(later.cycles[1]).toMatchObject({ paid: 500, status: 'partial' });
    expect(later.credit).toBe(0);
  });

  test('payableNow is what is overdue plus what is left of the current cycle', () => {
    const ledger = ledgerOf(monthly('2027-03-17'), '2027-04-10', { payments: [{ amount: 100 }] });
    expect(ledger.overdue).toBe(626);
    expect(ledger.current).toBe(1500);
    expect(ledger.payableNow).toBe(626 + 1500);
  });

  test('refunded payments are ignored', () => {
    const ledger = ledgerOf(monthly('2027-03-01'), '2027-04-02', {
      payments: [{ amount: 1500, refunded: true }],
    });
    expect(ledger.overdue).toBe(1500);
  });

  test('a current-cycle projection stops at an open pause', () => {
    const billing = monthly('2027-03-01', { pauses: [{ from: day('2027-04-11') }] });
    const ledger = ledgerOf(billing, '2027-04-15');
    expect(ledger.state).toBe('paused');
    expect(ledger.cycles[1]).toMatchObject({ activeDays: 10, charge: 500, phase: 'current' });
  });
});

describe('buildLedger: start in the future (EH4) and state', () => {
  test('a start in a later cycle has nothing owed and nothing accruing', () => {
    const ledger = ledgerOf(monthly('2027-05-03'), '2027-04-10');
    expect(ledger).toMatchObject({
      state: 'scheduled',
      cycles: [],
      overdue: 0,
      current: 0,
      payableNow: 0,
      nextDue: null,
    });
  });

  test('a start later in the current cycle shows that cycle projected, not overdue', () => {
    const ledger = ledgerOf(monthly('2027-04-21'), '2027-04-10');
    expect(ledger.state).toBe('scheduled');
    expect(ledger.cycles[0]).toMatchObject({ phase: 'current', activeDays: 10, charge: 500 });
    expect(ledger.overdue).toBe(0);
  });

  test('state is active once billing has started', () => {
    expect(ledgerOf(monthly('2027-04-01'), '2027-04-01').state).toBe('active');
  });

  test('a closed pause no longer pauses', () => {
    const billing = monthly('2027-03-01', {
      pauses: [{ from: day('2027-03-05'), to: day('2027-03-10') }],
    });
    expect(ledgerOf(billing, '2027-03-10').state).toBe('active');
    expect(ledgerOf(billing, '2027-03-09').state).toBe('paused');
  });

  test('no billing at all is an empty ledger', () => {
    expect(ledgerOf(null, '2027-04-10')).toMatchObject({ state: 'none', cycles: [] });
  });
});

describe('billingEntitlement', () => {
  test.each([
    [{ state: 'none', overdue: 0 }, 'none'],
    [{ state: 'ended', overdue: 500 }, 'ended'],
    [{ state: 'scheduled', overdue: 0 }, 'scheduled'],
    [{ state: 'paused', overdue: 500 }, 'paused'],
    [{ state: 'active', overdue: 1 }, 'unpaid'],
    [{ state: 'active', overdue: 0 }, 'valid'],
  ])('%o is %s', (ledger, expected) => {
    expect(billingEntitlement(ledger)).toBe(expected);
  });
});

describe('validateStartDay (R3, EH5)', () => {
  test('31 days back is allowed, 32 is not', () => {
    expect(validateStartDay({ startDay: '2027-03-10', today: '2027-04-10' })).toBeNull();
    expect(validateStartDay({ startDay: '2027-03-09', today: '2027-04-10' })).toBe('too_far_back');
  });

  test('any future day is allowed', () => {
    expect(validateStartDay({ startDay: '2028-01-01', today: '2027-04-10' })).toBeNull();
  });
});

describe('settledSpan (receipt period)', () => {
  const billing = monthly('2027-03-17');
  const before = ledgerOf(billing, '2027-05-02', { payments: [{ amount: 500 }] });

  test('spans the cycles a payment put money on', () => {
    const after = ledgerOf(billing, '2027-05-02', { payments: [{ amount: 500 }, { amount: 800 }] });
    expect(settledSpan(before, after)).toEqual({ start: '2027-03-01', end: '2027-05-01' });
  });

  test('is null when a payment only adds credit', () => {
    const paidUp = ledgerOf(billing, '2027-03-20', { payments: [{ amount: 726 }] });
    const more = ledgerOf(billing, '2027-03-20', { payments: [{ amount: 726 }, { amount: 50 }] });
    expect(settledSpan(paidUp, more)).toBeNull();
  });
});

describe('small helpers', () => {
  test('isBillingAssignment', () => {
    expect(isBillingAssignment({ billing: monthly('2027-03-01') })).toBe(true);
    expect(isBillingAssignment({ billing: { segments: [] } })).toBe(false);
    expect(isBillingAssignment({ coversFrom: new Date() })).toBe(false);
    expect(isBillingAssignment(null)).toBe(false);
  });

  test('day keys round-trip', () => {
    expect(dayKeyOf('2027-03-17').toISOString()).toBe('2027-03-17T00:00:00.000Z');
    expect(dayStringOf(dayKeyOf('2028-02-29'))).toBe('2028-02-29');
  });
});

describe("the centre's day (EH8)", () => {
  test('23:30 IST is already the next day in IST but not in UTC', () => {
    const instant = new Date('2027-03-31T18:00:00Z'); // 23:30 IST on 31 March
    expect(dayStringInTz(instant, 'Asia/Kolkata')).toBe('2027-03-31');
    expect(dayStringInTz(new Date('2027-03-31T19:00:00Z'), 'Asia/Kolkata')).toBe('2027-04-01');
    expect(instant.toISOString().slice(0, 10)).toBe('2027-03-31');
  });
});
