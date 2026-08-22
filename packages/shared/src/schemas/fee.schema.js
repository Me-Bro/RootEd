import { z } from 'zod';

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

const feeStructureBaseSchema = z.object({
  name: z.string().trim().min(1),
  academicYearId: objectId,
  components: z.array(feeComponentSchema).min(1),
  applicableTo: z.enum(['all', 'class', 'student']).default('all'),
  classId: objectId.optional(),
  dueDate: z.coerce.date().optional(),
  installments: z.array(installmentSchema).optional(),
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
  );

export const updateFeeStructureSchema = feeStructureBaseSchema.partial();

export const assignFeeStructureSchema = z.object({
  sectionId: objectId,
  dueDate: z.coerce.date().optional(),
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
