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

// Study centers: a structure with a cycle bills a learner every calendar month or
// every Monday-to-Sunday week from a start date; its amount is the price per cycle.
export const BILLING_CYCLES = ['monthly', 'weekly'];
// How far back a learner's billing start date may be set, in days.
export const MAX_BACKDATE_DAYS = 31;

// A calendar day in the centre's own calendar, as YYYY-MM-DD.
export const dayStringSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
  .refine((s) => {
    const d = new Date(`${s}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
  }, 'Not a real date');

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
  cycle: z.enum(BILLING_CYCLES).optional(),
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
  // A cycle structure bills each learner from their own start date: it is neither a
  // desk-sold plan nor paid in fixed installments, and it is set per learner.
  .refine((v) => !v.cycle || !v.plan, {
    message: 'A billing cycle cannot be combined with a plan',
    path: ['cycle'],
  })
  .refine((v) => !v.cycle || !v.installments?.length, {
    message: 'A billing cycle has no installments; each cycle is billed on its own',
    path: ['installments'],
  })
  .transform((v) => (v.plan || v.cycle ? { ...v, applicableTo: 'student' } : v));

export const updateFeeStructureSchema = feeStructureBaseSchema.partial();

export const assignFeeStructureSchema = z.object({
  sectionId: objectId,
  dueDate: z.coerce.date().optional(),
});

// Study centers: put a learner on a fee structure from the student page. For a cycle
// structure `startDate` is the first billable day (required the first time; on a
// change it is the day the new structure takes over, default today).
export const setStudentFeeStructureSchema = z.object({
  feeStructureId: objectId,
  startDate: optional(dayStringSchema),
});

// Study centers, owner only: pause a learner's billing from `on` (their seats are
// released), or resume it from `on`, optionally giving them a seat again.
export const pauseBillingSchema = z.object({ on: dayStringSchema }).strict();
export const resumeBillingSchema = z
  .object({
    on: dayStringSchema,
    seatId: optional(objectId),
    sectionId: optional(objectId),
  })
  .strict()
  .refine((v) => !v.seatId === !v.sectionId, {
    message: 'Choose both a seat and a shift, or neither',
    path: ['seatId'],
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

// Undo a sale made by mistake (wrong learner or plan). The reason is kept in the audit log.
export const voidSaleSchema = z.object({ reason: z.string().trim().min(1).max(200) }).strict();

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
