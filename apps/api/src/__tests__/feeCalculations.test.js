import {
  calculateMandatoryTotal,
  calculateEffectiveTotal,
  installmentsMatchTotal,
  calculateLateFeeAmount,
  scaleComponents,
  calculateDiscountAmount,
  calculateRemainingDue,
  recomputeFeeStatus,
  canWaiveAssignment,
  discountAppliesTo,
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

test('calculateDiscountAmount percentage type computes and rounds', () => {
  expect(calculateDiscountAmount({ type: 'percentage', value: 10, baseAmount: 5000 })).toBe(500);
  expect(calculateDiscountAmount({ type: 'percentage', value: 3.33, baseAmount: 1000 })).toBe(33);
});

test('calculateDiscountAmount flat type returns the flat value when under baseAmount', () => {
  expect(calculateDiscountAmount({ type: 'flat', value: 500, baseAmount: 5000 })).toBe(500);
});

test('calculateDiscountAmount flat type is capped at baseAmount', () => {
  expect(calculateDiscountAmount({ type: 'flat', value: 9000, baseAmount: 5000 })).toBe(5000);
});

test('calculateRemainingDue for whole assignment nets prior payments', () => {
  expect(calculateRemainingDue({ assignment: { totalAmount: 5000 }, totalPaid: 2000 })).toBe(3000);
});

test('calculateRemainingDue accounts for discount and late fee', () => {
  expect(
    calculateRemainingDue({
      assignment: { totalAmount: 5000, discountAmount: 500, lateFeeAmount: 100 },
      totalPaid: 1000,
    })
  ).toBe(3600);
});

test('calculateRemainingDue for a specific installment ignores other installments', () => {
  const assignment = {
    totalAmount: 6000,
    installments: [
      { amount: 3000, paidAmount: 1000 },
      { amount: 3000, paidAmount: 0 },
    ],
  };
  expect(calculateRemainingDue({ assignment, totalPaid: 1000, installmentIndex: 0 })).toBe(2000);
  expect(calculateRemainingDue({ assignment, totalPaid: 1000, installmentIndex: 1 })).toBe(3000);
});

test('calculateRemainingDue is zero when exactly paid', () => {
  expect(calculateRemainingDue({ assignment: { totalAmount: 5000 }, totalPaid: 5000 })).toBe(0);
});

test('recomputeFeeStatus is unpaid with no payments', () => {
  const result = recomputeFeeStatus({ assignment: { totalAmount: 5000 }, payments: [] });
  expect(result.status).toBe('unpaid');
});

test('recomputeFeeStatus is partial when payments are under the effective total', () => {
  const result = recomputeFeeStatus({
    assignment: { totalAmount: 5000 },
    payments: [{ amount: 2000 }],
  });
  expect(result.status).toBe('partial');
});

test('recomputeFeeStatus is paid when payments meet or exceed the effective total', () => {
  const result = recomputeFeeStatus({
    assignment: { totalAmount: 5000, discountAmount: 500 },
    payments: [{ amount: 4500 }],
  });
  expect(result.status).toBe('paid');
});

test('recomputeFeeStatus tracks per-installment status independently', () => {
  const assignment = {
    totalAmount: 6000,
    installments: [
      { label: 'I1', amount: 3000, dueDate: new Date(), status: 'unpaid', paidAmount: 0 },
      { label: 'I2', amount: 3000, dueDate: new Date(), status: 'unpaid', paidAmount: 0 },
    ],
  };
  const result = recomputeFeeStatus({
    assignment,
    payments: [{ amount: 3000, installmentIndex: 0 }],
  });
  expect(result.installments[0].status).toBe('paid');
  expect(result.installments[0].paidAmount).toBe(3000);
  expect(result.installments[1].status).toBe('unpaid');
  expect(result.status).toBe('partial');
});

test('recomputeFeeStatus reverts to a lower status when a payment is excluded (refund)', () => {
  const assignment = { totalAmount: 5000 };
  const fullyPaid = recomputeFeeStatus({ assignment, payments: [{ amount: 5000 }] });
  expect(fullyPaid.status).toBe('paid');

  const afterRefund = recomputeFeeStatus({ assignment, payments: [] });
  expect(afterRefund.status).toBe('unpaid');
});

test('canWaiveAssignment allows unpaid and partial, rejects paid and waived', () => {
  expect(canWaiveAssignment('unpaid')).toBe(true);
  expect(canWaiveAssignment('partial')).toBe(true);
  expect(canWaiveAssignment('paid')).toBe(false);
  expect(canWaiveAssignment('waived')).toBe(false);
});

test('discountAppliesTo returns true for applicableTo all', () => {
  expect(
    discountAppliesTo({
      discount: { applicableTo: 'all' },
      assignment: { studentId: 's1' },
    })
  ).toBe(true);
});

test('discountAppliesTo matches student-targeted discounts by studentId', () => {
  expect(
    discountAppliesTo({
      discount: { applicableTo: 'student', studentId: 's1' },
      assignment: { studentId: 's1' },
    })
  ).toBe(true);
  expect(
    discountAppliesTo({
      discount: { applicableTo: 'student', studentId: 's1' },
      assignment: { studentId: 's2' },
    })
  ).toBe(false);
});

test('discountAppliesTo matches class-targeted discounts by studentClassId', () => {
  expect(
    discountAppliesTo({
      discount: { applicableTo: 'class', classId: 'c1' },
      assignment: { studentId: 's1' },
      studentClassId: 'c1',
    })
  ).toBe(true);
  expect(
    discountAppliesTo({
      discount: { applicableTo: 'class', classId: 'c1' },
      assignment: { studentId: 's1' },
      studentClassId: 'c2',
    })
  ).toBe(false);
  expect(
    discountAppliesTo({
      discount: { applicableTo: 'class', classId: 'c1' },
      assignment: { studentId: 's1' },
      studentClassId: undefined,
    })
  ).toBe(false);
});
