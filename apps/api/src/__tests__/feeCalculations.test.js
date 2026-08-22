import {
  calculateMandatoryTotal,
  calculateEffectiveTotal,
  installmentsMatchTotal,
  calculateLateFeeAmount,
  scaleComponents,
} from '../utils/feeCalculations.js';

test('sums only non-optional components', () => {
  expect(
    calculateMandatoryTotal([
      { label: 'Tuition', amount: 5000, isOptional: false },
      { label: 'Trip', amount: 800, isOptional: true },
    ])
  ).toBe(5000);
});

test('components with isOptional omitted are treated as mandatory', () => {
  expect(calculateMandatoryTotal([{ label: 'Tuition', amount: 5000 }])).toBe(5000);
});

test('calculateEffectiveTotal nets discount and adds late fee', () => {
  expect(
    calculateEffectiveTotal({ totalAmount: 5500, discountAmount: 500, lateFeeAmount: 100 })
  ).toBe(5100);
});

test('calculateEffectiveTotal defaults missing discount/lateFee to 0', () => {
  expect(calculateEffectiveTotal({ totalAmount: 5500 })).toBe(5500);
});

test('installmentsMatchTotal true when sums match', () => {
  expect(
    installmentsMatchTotal(
      [
        { label: 'I1', amount: 600 },
        { label: 'I2', amount: 400 },
      ],
      [{ label: 'Tuition', amount: 1000, isOptional: false }]
    )
  ).toBe(true);
});

test('installmentsMatchTotal false when sums differ', () => {
  expect(
    installmentsMatchTotal([{ label: 'I1', amount: 500 }], [{ label: 'Tuition', amount: 1000 }])
  ).toBe(false);
});

test('installmentsMatchTotal ignores optional components in the target total', () => {
  expect(
    installmentsMatchTotal(
      [{ label: 'I1', amount: 1000 }],
      [
        { label: 'Tuition', amount: 1000 },
        { label: 'Trip', amount: 500, isOptional: true },
      ]
    )
  ).toBe(true);
});

test('calculateLateFeeAmount flat type returns the flat value', () => {
  expect(calculateLateFeeAmount({ type: 'flat', value: 200, baseAmount: 5000 })).toBe(200);
});

test('calculateLateFeeAmount percentage type computes and rounds', () => {
  expect(calculateLateFeeAmount({ type: 'percentage', value: 5, baseAmount: 5000 })).toBe(250);
  expect(calculateLateFeeAmount({ type: 'percentage', value: 3.33, baseAmount: 1000 })).toBe(33);
});

test('scaleComponents with no adjustment returns amounts unchanged', () => {
  expect(scaleComponents([{ label: 'T', amount: 1000 }])).toEqual([{ label: 'T', amount: 1000 }]);
});

test('scaleComponents applies a positive percentage adjustment and rounds', () => {
  expect(scaleComponents([{ label: 'T', amount: 1000 }], 10)).toEqual([
    { label: 'T', amount: 1100 },
  ]);
  expect(scaleComponents([{ label: 'T', amount: 333 }], 10)).toEqual([{ label: 'T', amount: 366 }]);
});

test('scaleComponents applies a negative percentage adjustment', () => {
  expect(scaleComponents([{ label: 'T', amount: 1000 }], -10)).toEqual([
    { label: 'T', amount: 900 },
  ]);
});
