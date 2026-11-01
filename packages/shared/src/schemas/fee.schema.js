import { z } from 'zod';

function optional(schema) {
  return z.preprocess((v) => (v === '' ? undefined : v), schema.optional());
}

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');

export const feeComponentSchema = z.object({
  label: z.string().trim().min(1),
  amount: z.coerce.number().positive(),
  isOptional: z.boolean().default(false),
});

export const installmentSchema = z.object({
  label: z.string().trim().min(1),
  amount: z.coerce.number().positive(),
  dueDate: z.coerce.date(),
});

// What a study-center structure sells. A day pass covers one calendar day; a shift
// plan covers `durationDays` from its start, optionally for one shift (a Section).
export const PLAN_KINDS = ['day_pass', 'shift_plan'];
export const planSchema = z
  .object({
    kind: z.enum(PLAN_KINDS),
    durationDays: z.coerce.number().int().min(1).max(366),
    sectionId: objectId.optional(),
  })
  .strict()
  .refine((p) => p.kind !== 'day_pass' || p.durationDays === 1, {
    message: 'A day pass lasts one day',
    path: ['durationDays'],
  });

const feeStructureBaseSchema = z.object({
  name: z.string().trim().min(1),
  academicYearId: objectId,
  components: z.array(feeComponentSchema).min(1),
  applicableTo: z.enum(['all', 'class', 'student']).default('all'),
  classId: objectId.optional(),
  dueDate: z.coerce.date().optional(),
  installments: z.array(installmentSchema).optional(),
  lateFeeEnabled: z.boolean().default(false),
  lateFeeType: z.enum(['flat', 'percentage']).optional(),
  lateFeeValue: z.coerce.number().nonnegative().optional(),
  lateFeeGraceDays: z.coerce.number().int().nonnegative().default(0),
  plan: planSchema.optional(),
});

export const createFeeStructureSchema = feeStructureBaseSchema
  .refine((v) => v.applicableTo !== 'class' || Boolean(v.classId), {
    message: 'classId required when applicableTo is class',
    path: ['classId'],
  })
  .refine(
    (v) => {
      if (!v.installments?.length) return true;
      const installmentTotal = v.installments.reduce((sum, i) => sum + i.amount, 0);
      const mandatoryTotal = v.components.reduce(
        (sum, c) => (c.isOptional ? sum : sum + c.amount),
        0
      );
      return installmentTotal === mandatoryTotal;
    },
    {
      message: 'sum of installment amounts must equal the sum of mandatory component amounts',
      path: ['installments'],
    }
  )
  .refine((v) => !v.lateFeeEnabled || (v.lateFeeType && v.lateFeeValue !== undefined), {
    message: 'lateFeeType and lateFeeValue are required when lateFeeEnabled is true',
    path: ['lateFeeType'],
  })
  // A plan is bought one learner at a time at the desk: no installments (each period
  // is its own sale) and never auto-assigned to a whole roster, so it is always
  // per-student whatever the form sent.
  .refine((v) => !v.plan || !v.installments?.length, {
    message: 'A plan has no installments; each period is its own sale',
    path: ['installments'],
  })
  .transform((v) => (v.plan ? { ...v, applicableTo: 'student' } : v));

export const updateFeeStructureSchema = feeStructureBaseSchema.partial();

export const assignFeeStructureSchema = z.object({
  sectionId: objectId,
  dueDate: z.coerce.date().optional(),
});

export const cloneFeeStructureSchema = z.object({
  targetAcademicYearId: objectId,
  amountAdjustmentPercent: z.coerce.number().optional(),
});

export const createFeeDiscountSchema = z
  .object({
    name: z.string().trim().min(1),
    type: z.enum(['percentage', 'flat']),
    value: z.coerce.number().positive(),
    applicableTo: z.enum(['all', 'class', 'student']),
    classId: objectId.optional(),
    studentId: objectId.optional(),
    academicYearId: objectId,
    // Optional window. A discount for one learner must end, so it never lasts forever.
    validFrom: z.coerce.date().optional(),
    validTo: z.coerce.date().optional(),
  })
  .refine((v) => v.applicableTo !== 'student' || Boolean(v.validTo), {
    message: 'A discount for one learner needs an end date',
    path: ['validTo'],
  })
  .refine((v) => !v.validFrom || !v.validTo || v.validTo >= v.validFrom, {
    message: 'The end date must not be before the start date',
    path: ['validTo'],
  })
  .refine((v) => v.applicableTo !== 'class' || Boolean(v.classId), {
    message: 'classId required when applicableTo is class',
    path: ['classId'],
  })
  .refine((v) => v.applicableTo !== 'student' || Boolean(v.studentId), {
    message: 'studentId required when applicableTo is student',
    path: ['studentId'],
  })
  .refine((v) => v.type !== 'percentage' || v.value <= 100, {
    message: 'percentage discount value must be <= 100',
    path: ['value'],
  });

export const recordFeePaymentSchema = z.object({
  assignmentId: objectId,
  amount: z.coerce.number().positive(),
  paymentMethod: z.enum(['cash', 'card', 'upi', 'bank_transfer', 'cheque']),
  transactionId: optional(z.string().trim()),
  notes: optional(z.string().trim()),
  installmentIndex: optional(z.coerce.number().int().nonnegative()),
});

// Sell one plan or day pass at the desk and take the payment in the same request.
export const saleSchema = z
  .object({
    studentId: objectId,
    feeStructureId: objectId,
    paymentMethod: z.enum(['cash', 'card', 'upi', 'bank_transfer', 'cheque']),
    transactionId: optional(z.string().trim()),
    discountId: optional(objectId),
    // Defaults to today in the centre's timezone.
    startDate: optional(z.coerce.date()),
  })
  .strict();

export const entitlementQuerySchema = z.object({ studentId: objectId });

export const applyFeeDiscountSchema = z.object({
  discountId: objectId,
});

export const waiveFeeAssignmentSchema = z.object({
  reason: optional(z.string().trim().min(1).max(500)),
});

export const refundFeePaymentSchema = z.object({
  reason: optional(z.string().trim().min(1).max(500)),
});
