import {
  calculateMandatoryTotal,
  calculateEffectiveTotal,
  installmentsMatchTotal,
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
