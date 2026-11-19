import {
  BILLING_CYCLES,
  createFeeStructureSchema,
  updateFeeStructureSchema,
  setStudentFeeStructureSchema,
  pauseBillingSchema,
  resumeBillingSchema,
  dayStringSchema,
} from '@rooted/shared/schemas';

const YEAR = '65a0000000000000000000aa';
const SEAT = '65a0000000000000000000bb';
const SHIFT = '65a0000000000000000000cc';

const structure = (extra = {}) => ({
  name: 'Morning monthly',
  academicYearId: YEAR,
  components: [{ label: 'Seat', amount: 1500 }],
  ...extra,
});

describe('fee structure cycle', () => {
  test('monthly and weekly only', () => {
    expect(BILLING_CYCLES).toEqual(['monthly', 'weekly']);
    expect(createFeeStructureSchema.safeParse(structure({ cycle: 'biweekly' })).success).toBe(
      false
    );
  });

  test('a cycle structure is set per learner', () => {
    const parsed = createFeeStructureSchema.parse(structure({ cycle: 'monthly' }));
    expect(parsed).toMatchObject({ cycle: 'monthly', applicableTo: 'student' });
  });

  test('a cycle cannot be combined with a plan or installments', () => {
    const withPlan = structure({
      cycle: 'monthly',
      plan: { kind: 'shift_plan', durationDays: 30 },
    });
    expect(createFeeStructureSchema.safeParse(withPlan).success).toBe(false);

    const withInstallments = structure({
      cycle: 'weekly',
      installments: [{ label: 'One', amount: 1500, dueDate: '2027-04-01' }],
    });
    expect(createFeeStructureSchema.safeParse(withInstallments).success).toBe(false);
  });

  test('a structure without a cycle is unchanged', () => {
    const parsed = createFeeStructureSchema.parse(structure());
    expect(parsed.cycle).toBeUndefined();
    expect(parsed.applicableTo).toBe('all');
  });

  test('the cycle can be edited', () => {
    expect(updateFeeStructureSchema.parse({ cycle: 'weekly' })).toEqual({ cycle: 'weekly' });
  });
});

describe('dayStringSchema', () => {
  test.each(['2027-02-29', '2027-13-01', '27-03-01', '2027-3-1', ''])('refuses %p', (s) => {
    expect(dayStringSchema.safeParse(s).success).toBe(false);
  });

  test('accepts a real day', () => {
    expect(dayStringSchema.parse('2028-02-29')).toBe('2028-02-29');
  });
});

describe('setStudentFeeStructureSchema', () => {
  test('start date is optional and a day string', () => {
    expect(setStudentFeeStructureSchema.parse({ feeStructureId: YEAR })).toEqual({
      feeStructureId: YEAR,
    });
    expect(
      setStudentFeeStructureSchema.parse({ feeStructureId: YEAR, startDate: '2027-03-17' })
    ).toEqual({ feeStructureId: YEAR, startDate: '2027-03-17' });
    expect(setStudentFeeStructureSchema.parse({ feeStructureId: YEAR, startDate: '' })).toEqual({
      feeStructureId: YEAR,
    });
    expect(
      setStudentFeeStructureSchema.safeParse({ feeStructureId: YEAR, startDate: '17/03/2027' })
        .success
    ).toBe(false);
  });
});

describe('pause and resume', () => {
  test('pause needs a day and nothing else', () => {
    expect(pauseBillingSchema.parse({ on: '2027-04-05' })).toEqual({ on: '2027-04-05' });
    expect(pauseBillingSchema.safeParse({}).success).toBe(false);
    expect(pauseBillingSchema.safeParse({ on: '2027-04-05', extra: 1 }).success).toBe(false);
  });

  test('resume takes a seat and shift together, or neither', () => {
    expect(resumeBillingSchema.parse({ on: '2027-04-20' })).toEqual({ on: '2027-04-20' });
    expect(
      resumeBillingSchema.parse({ on: '2027-04-20', seatId: SEAT, sectionId: SHIFT })
    ).toMatchObject({ seatId: SEAT, sectionId: SHIFT });
    expect(resumeBillingSchema.safeParse({ on: '2027-04-20', seatId: SEAT }).success).toBe(false);
  });
});
