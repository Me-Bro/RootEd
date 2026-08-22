import {
  SalaryComponentError,
  resolveComponents,
  computeTotals,
} from '../utils/salaryCalculations.js';

test('flat (non-percentage) components pass through unchanged', () => {
  expect(
    resolveComponents([
      { label: 'Basic', type: 'earning', amount: 30000, isPercentage: false },
      { label: 'PF', type: 'deduction', amount: 1800, isPercentage: false },
    ])
  ).toEqual([
    { label: 'Basic', type: 'earning', amount: 30000 },
    { label: 'PF', type: 'deduction', amount: 1800 },
  ]);
});

test('percentage component resolves against its flat baseRef', () => {
  const resolved = resolveComponents([
    { label: 'Basic', type: 'earning', amount: 30000, isPercentage: false },
    { label: 'HRA', type: 'earning', amount: 40, isPercentage: true, baseRef: 'Basic' },
  ]);
  expect(resolved).toEqual([
    { label: 'Basic', type: 'earning', amount: 30000 },
    { label: 'HRA', type: 'earning', amount: 12000 },
  ]);
});

test('percentage resolution rounds to 2 decimal places', () => {
  const resolved = resolveComponents([
    { label: 'Basic', type: 'earning', amount: 10000, isPercentage: false },
    { label: 'Bonus', type: 'earning', amount: 33.33, isPercentage: true, baseRef: 'Basic' },
  ]);
  expect(resolved.find((c) => c.label === 'Bonus').amount).toBe(3333);
});

test('percentage component with no baseRef throws SalaryComponentError', () => {
  expect(() =>
    resolveComponents([{ label: 'HRA', type: 'earning', amount: 40, isPercentage: true }])
  ).toThrow(SalaryComponentError);
});

test('percentage component referencing an unknown baseRef throws', () => {
  expect(() =>
    resolveComponents([
      { label: 'Basic', type: 'earning', amount: 30000, isPercentage: false },
      { label: 'HRA', type: 'earning', amount: 40, isPercentage: true, baseRef: 'Nonexistent' },
    ])
  ).toThrow(/unknown base component/);
});

test('percentage-of-percentage (chained) throws instead of silently defaulting to 0', () => {
  expect(() =>
    resolveComponents([
      { label: 'Basic', type: 'earning', amount: 30000, isPercentage: false },
      { label: 'HRA', type: 'earning', amount: 40, isPercentage: true, baseRef: 'Basic' },
      { label: 'HRA Bonus', type: 'earning', amount: 10, isPercentage: true, baseRef: 'HRA' },
    ])
  ).toThrow(/percentage-of-percentage/);
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
