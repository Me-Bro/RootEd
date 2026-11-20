import {
  collectionTrend,
  expenseTrend,
  lastMonths,
  monthDayBounds,
  pendingByMonth,
  pendingByStudent,
  pendingItems,
  pendingTotals,
  previousMonth,
  summarizeCollection,
  summarizeExpenses,
} from '../utils/centreFinance.js';

const TZ = 'Asia/Kolkata';
const day = (s) => new Date(`${s}T00:00:00.000Z`);

describe('months', () => {
  test('previousMonth crosses a year boundary', () => {
    expect(previousMonth('2026-03')).toBe('2026-02');
    expect(previousMonth('2026-01')).toBe('2025-12');
  });

  test('lastMonths lists the window oldest first, ending at the month', () => {
    expect(lastMonths('2026-02', 4)).toEqual(['2025-11', '2025-12', '2026-01', '2026-02']);
  });

  test('monthDayBounds is half open', () => {
    expect(monthDayBounds('2026-12')).toEqual({ from: '2026-12-01', to: '2027-01-01' });
  });
});

describe('summarizeExpenses', () => {
  const entries = [
    { status: 'approved', invoiceDate: day('2026-11-01'), category: 'rent', amount: 20000 },
    { status: 'approved', invoiceDate: day('2026-11-30'), category: 'electricity', amount: 3500.5 },
    { status: 'paid', invoiceDate: day('2026-11-15'), category: 'electricity', amount: 1000 },
    { status: 'rejected', invoiceDate: day('2026-11-10'), category: 'rent', amount: 999 },
    { status: 'draft', invoiceDate: day('2026-11-10'), category: 'rent', amount: 999 },
    { status: 'approved', invoiceDate: day('2026-10-31'), category: 'rent', amount: 5 },
    { status: 'approved', invoiceDate: day('2026-12-01'), category: 'rent', amount: 7 },
  ];

  test('counts approved and paid entries of the month only, split by category, largest first', () => {
    expect(summarizeExpenses(entries, '2026-11')).toEqual({
      month: '2026-11',
      total: 24500.5,
      count: 3,
      categories: [
        { category: 'rent', total: 20000, count: 1 },
        { category: 'electricity', total: 4500.5, count: 2 },
      ],
    });
  });

  test('a month with nothing is a zero total, not an error', () => {
    expect(summarizeExpenses(entries, '2026-09')).toEqual({
      month: '2026-09',
      total: 0,
      count: 0,
      categories: [],
    });
  });

  test('trend has a zero for every month in the window', () => {
    expect(expenseTrend(entries, ['2026-09', '2026-10', '2026-11'])).toEqual([
      { month: '2026-09', total: 0 },
      { month: '2026-10', total: 5 },
      { month: '2026-11', total: 24500.5 },
    ]);
  });
});

describe('collection', () => {
  const payments = [
    { amount: 1000, paymentMethod: 'cash', paymentDate: new Date('2026-11-05T10:00:00Z') },
    { amount: 2000, paymentMethod: 'upi', paymentDate: new Date('2026-11-06T10:00:00Z') },
    { amount: 500, paymentMethod: 'cash', paymentDate: new Date('2026-11-07T10:00:00Z') },
    {
      amount: 700,
      paymentMethod: 'cash',
      paymentDate: new Date('2026-11-08T10:00:00Z'),
      refunded: true,
    },
    // 23:00 UTC on 30 Nov is 04:30 IST on 1 Dec: December on the centre's calendar.
    { amount: 300, paymentMethod: 'upi', paymentDate: new Date('2026-11-30T23:00:00Z') },
  ];

  test('sums the month on the centre calendar, split by method, refunds left out', () => {
    expect(summarizeCollection(payments, '2026-11', TZ)).toEqual({
      month: '2026-11',
      total: 3500,
      count: 3,
      methods: [
        { method: 'upi', total: 2000, count: 1 },
        { method: 'cash', total: 1500, count: 2 },
      ],
    });
  });

  test('a payment late on the last UTC day belongs to the next month in IST', () => {
    expect(summarizeCollection(payments, '2026-12', TZ).total).toBe(300);
  });

  test('trend leaves refunded money out of the month it was taken in', () => {
    expect(collectionTrend(payments, ['2026-10', '2026-11', '2026-12'], TZ)).toEqual([
      { month: '2026-10', total: 0 },
      { month: '2026-11', total: 3500 },
      { month: '2026-12', total: 300 },
    ]);
  });
});

describe('pending fees', () => {
  const ctx = { today: '2026-11-20', timezone: TZ };
  const plan = (studentId, cycles) => ({
    _id: `a-${studentId}`,
    studentId,
    status: 'unpaid',
    ledger: { cycles },
  });
  const cycle = (dueOn, net, paid, phase) => ({ dueOn, net, paid, phase });

  test('a plan yields one item per cycle, due in the month the cycle ends', () => {
    const items = pendingItems(
      plan('s1', [
        cycle('2026-10-31', 1000, 400, 'closed'),
        cycle('2026-11-30', 1000, 0, 'current'),
      ]),
      ctx
    );
    expect(items.map((i) => [i.month, i.phase, i.billed, i.paid, i.pending])).toEqual([
      ['2026-10', 'closed', 1000, 400, 600],
      ['2026-11', 'current', 1000, 0, 1000],
    ]);
  });

  test('a weekly cycle straddling two months falls in the month it ends', () => {
    const [item] = pendingItems(plan('s1', [cycle('2026-12-02', 700, 0, 'current')]), ctx);
    expect(item.month).toBe('2026-12');
  });

  test('a waived assignment owes nothing', () => {
    expect(pendingItems({ ...plan('s1', []), status: 'waived' }, ctx)).toEqual([]);
  });

  test('a one-off assignment is one item, overdue only once its due date has passed', () => {
    const base = {
      _id: 'o1',
      studentId: 's2',
      totalAmount: 500,
      discountAmount: 100,
      paidAmount: 100,
    };
    const [late] = pendingItems({ ...base, dueDate: day('2026-11-10'), balanceDue: 300 }, ctx);
    const [soon] = pendingItems({ ...base, dueDate: day('2026-11-25'), balanceDue: 300 }, ctx);
    expect(late).toMatchObject({
      kind: 'oneOff',
      billed: 400,
      paid: 100,
      pending: 300,
      phase: 'closed',
    });
    expect(soon.phase).toBe('current');
  });

  const items = [
    ...pendingItems(
      plan('s1', [
        cycle('2026-09-30', 1000, 1000, 'closed'),
        cycle('2026-10-31', 1000, 400, 'closed'),
        cycle('2026-11-30', 1000, 0, 'current'),
      ]),
      ctx
    ),
    ...pendingItems(
      plan('s2', [cycle('2026-10-31', 800, 0, 'closed'), cycle('2026-11-30', 800, 800, 'current')]),
      ctx
    ),
    ...pendingItems(plan('s3', [cycle('2026-11-30', 500, 500, 'current')]), ctx),
  ];

  test('student-wise: only learners who owe, overdue split from current, largest first', () => {
    expect(pendingByStudent(items)).toEqual([
      {
        studentId: 's1',
        overdue: 600,
        current: 1000,
        pending: 1600,
        oldestMonth: '2026-10',
        oldestDueOn: '2026-10-31',
      },
      {
        studentId: 's2',
        overdue: 800,
        current: 0,
        pending: 800,
        oldestMonth: '2026-10',
        oldestDueOn: '2026-10-31',
      },
    ]);
  });

  test('month-wise: billed, paid and pending per month, newest first, with closed or running', () => {
    expect(pendingByMonth(items, ctx)).toEqual([
      {
        month: '2026-11',
        billed: 2300,
        paid: 1300,
        pending: 1000,
        learnersOwing: 1,
        status: 'running',
      },
      {
        month: '2026-10',
        billed: 1800,
        paid: 400,
        pending: 1400,
        learnersOwing: 2,
        status: 'closed',
      },
      {
        month: '2026-09',
        billed: 1000,
        paid: 1000,
        pending: 0,
        learnersOwing: 0,
        status: 'closed',
      },
    ]);
  });

  test('totals: pending, the overdue part of it, and how many learners owe', () => {
    expect(pendingTotals(items)).toEqual({ pending: 2400, overdue: 1400, learnersOwing: 2 });
  });

  test('nothing billed gives empty reports, not zeros', () => {
    expect(pendingByStudent([])).toEqual([]);
    expect(pendingByMonth([], ctx)).toEqual([]);
    expect(pendingTotals([])).toEqual({ pending: 0, overdue: 0, learnersOwing: 0 });
  });
});
