import { summarizeFeeCollection } from '../utils/feeCollectionSummary.js';

test('sums assigned vs collected across assignments and rounds pct to 1 decimal', () => {
  const assignments = [
    { totalAmount: 40500, installments: [{ paidAmount: 16200 }, { paidAmount: 0 }] },
    { totalAmount: 20000, installments: [{ paidAmount: 20000 }] },
  ];

  const result = summarizeFeeCollection(assignments, []);

  expect(result).toMatchObject({
    totalAssigned: 60500,
    totalCollected: 36200,
    collectedPct: 59.8, // 36200 / 60500 = 59.83...
  });
});

test('an assignment with no installments contributes 0 collected, not a crash', () => {
  const assignments = [{ totalAmount: 5000, installments: [] }];

  const result = summarizeFeeCollection(assignments, []);

  expect(result).toMatchObject({ totalAssigned: 5000, totalCollected: 0, collectedPct: 0 });
});

test('zero assignments gives a null pct instead of dividing by zero', () => {
  const result = summarizeFeeCollection([], []);

  expect(result).toMatchObject({ totalAssigned: 0, totalCollected: 0, collectedPct: null });
});

test('overdueTotal only counts unpaid installments already past the given today', () => {
  const today = new Date('2026-08-25');
  const defaulters = [
    {
      installments: [
        // overdue and unpaid — counts
        { status: 'unpaid', amount: 12000, paidAmount: 0, dueDate: '2026-04-30' },
        // overdue but already paid — excluded
        { status: 'paid', amount: 8000, paidAmount: 8000, dueDate: '2026-04-30' },
        // not yet due — excluded even though unpaid
        { status: 'unpaid', amount: 5000, paidAmount: 0, dueDate: '2027-01-15' },
        // overdue and partially paid — counts the remainder only
        { status: 'unpaid', amount: 10000, paidAmount: 4000, dueDate: '2026-05-01' },
      ],
    },
  ];

  const result = summarizeFeeCollection([], defaulters, today);

  expect(result).toMatchObject({ defaulterCount: 1, overdueTotal: 12000 + (10000 - 4000) });
});

test('a study-center fee plan counts its ledger: billed cycles, all money paid, overdue', () => {
  const assignments = [
    { _id: 'plan', totalAmount: 1500, billing: { segments: [{}] } },
    { _id: 'one-off', totalAmount: 500, installments: [] },
  ];
  const ledgers = new Map([
    [
      'plan',
      {
        cycles: [
          { net: 1500, paid: 1500 },
          { net: 750, paid: 250 },
        ],
        credit: 0,
        overdue: 0,
      },
    ],
  ]);

  const result = summarizeFeeCollection(assignments, [], new Date(), ledgers);

  // The plan's 1500 per-cycle price is not counted as if it were a total.
  expect(result).toMatchObject({ totalAssigned: 1500 + 750 + 500, totalCollected: 1750 });
});

test('credit on a plan counts as collected and its overdue adds to the total', () => {
  const ledgers = new Map([
    ['p', { cycles: [{ net: 1000, paid: 400 }], credit: 0, overdue: 600 }],
    ['q', { cycles: [{ net: 1000, paid: 1000 }], credit: 300, overdue: 0 }],
  ]);
  const result = summarizeFeeCollection([{ _id: 'p' }, { _id: 'q' }], [], new Date(), ledgers);
  expect(result).toMatchObject({ totalAssigned: 2000, totalCollected: 1700, overdueTotal: 600 });
});

test('defaulterCount is the number of defaulter records, independent of overdueTotal', () => {
  const defaulters = [{ installments: [] }, { installments: [] }, { installments: [] }];

  const result = summarizeFeeCollection([], defaulters);

  expect(result).toMatchObject({ defaulterCount: 3, overdueTotal: 0 });
});
