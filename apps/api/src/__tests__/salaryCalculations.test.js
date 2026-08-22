import {
  SalaryComponentError,
  resolveComponents,
  computeTotals,
} from '../utils/salaryCalculations.js';

test('flat (non-percentage) components pass through unchanged', () => {
  expect(
    resolveComponents([
      { id: 'c1', label: 'Basic', type: 'earning', amount: 30000, isPercentage: false },
      { id: 'c2', label: 'PF', type: 'deduction', amount: 1800, isPercentage: false },
    ])
  ).toEqual([
    { label: 'Basic', type: 'earning', amount: 30000 },
    { label: 'PF', type: 'deduction', amount: 1800 },
  ]);
});

test('percentage component resolves against its flat baseRef by id, not label', () => {
  const resolved = resolveComponents([
    { id: 'c1', label: 'Basic Pay', type: 'earning', amount: 30000, isPercentage: false },
    { id: 'c2', label: 'HRA', type: 'earning', amount: 40, isPercentage: true, baseRef: 'c1' },
  ]);
  expect(resolved).toEqual([
    { label: 'Basic Pay', type: 'earning', amount: 30000 },
    { label: 'HRA', type: 'earning', amount: 12000 },
  ]);
});

test('percentage resolution rounds to 2 decimal places', () => {
  const resolved = resolveComponents([
    { id: 'c1', label: 'Basic', type: 'earning', amount: 10000, isPercentage: false },
    { id: 'c2', label: 'Bonus', type: 'earning', amount: 33.33, isPercentage: true, baseRef: 'c1' },
  ]);
  expect(resolved.find((c) => c.label === 'Bonus').amount).toBe(3333);
});

test('percentage component with no baseRef throws SalaryComponentError', () => {
  expect(() =>
    resolveComponents([{ id: 'c1', label: 'HRA', type: 'earning', amount: 40, isPercentage: true }])
  ).toThrow(SalaryComponentError);
});

test('percentage component referencing an unknown baseRef throws', () => {
  expect(() =>
    resolveComponents([
      { id: 'c1', label: 'Basic', type: 'earning', amount: 30000, isPercentage: false },
      {
        id: 'c2',
        label: 'HRA',
        type: 'earning',
        amount: 40,
        isPercentage: true,
        baseRef: 'nonexistent',
      },
    ])
  ).toThrow(/unknown base component/);
});

test('percentage-of-percentage (chained) throws instead of silently defaulting to 0', () => {
  expect(() =>
    resolveComponents([
      { id: 'c1', label: 'Basic', type: 'earning', amount: 30000, isPercentage: false },
      { id: 'c2', label: 'HRA', type: 'earning', amount: 40, isPercentage: true, baseRef: 'c1' },
      {
        id: 'c3',
        label: 'HRA Bonus',
        type: 'earning',
        amount: 10,
        isPercentage: true,
        baseRef: 'c2',
      },
    ])
  ).toThrow(/percentage-of-percentage/);
});

test('component missing a stable id throws, naming the id-backfill migration', () => {
  expect(() =>
    resolveComponents([{ label: 'Basic', type: 'earning', amount: 30000, isPercentage: false }])
  ).toThrow(/stable id/);
});

test('renaming a label does not orphan a percentage component that references the sibling by id', () => {
  const resolved = resolveComponents([
    { id: 'c1', label: 'Renamed Label', type: 'earning', amount: 30000, isPercentage: false },
    { id: 'c2', label: 'HRA', type: 'earning', amount: 40, isPercentage: true, baseRef: 'c1' },
  ]);
  expect(resolved.find((c) => c.label === 'HRA').amount).toBe(12000);
});

test('computeTotals sums only earning-type resolved components for grossEarnings', () => {
  const totals = computeTotals([
    { label: 'Basic', type: 'earning', amount: 30000 },
    { label: 'HRA', type: 'earning', amount: 12000 },
    { label: 'PF', type: 'deduction', amount: 1800 },
  ]);
  expect(totals.grossEarnings).toBe(42000);
  expect(totals.totalDeductions).toBe(1800);
  expect(totals.netPay).toBe(40200);
});

test('netPay can be negative when deductions exceed earnings', () => {
  const totals = computeTotals([
    { label: 'Basic', type: 'earning', amount: 1000 },
    { label: 'Penalty', type: 'deduction', amount: 5000 },
  ]);
  expect(totals.netPay).toBe(-4000);
});
