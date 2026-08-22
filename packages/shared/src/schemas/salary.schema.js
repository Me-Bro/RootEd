import { z } from 'zod';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');

export const salaryComponentSchema = z
  .object({
    label: z.string().trim().min(1),
    type: z.enum(['earning', 'deduction']),
    amount: z.coerce.number(),
    isPercentage: z.boolean().default(false),
    baseRef: z.string().trim().min(1).optional(),
  })
  .refine((v) => !v.isPercentage || Boolean(v.baseRef), {
    message: 'baseRef is required when isPercentage is true',
    path: ['baseRef'],
  });

const salaryStructureBaseSchema = z.object({
  name: z.string().trim().min(1),
  components: z.array(salaryComponentSchema).min(1),
});

export const createSalaryStructureSchema = salaryStructureBaseSchema.refine(
  (v) => {
    const flatLabels = new Set(v.components.filter((c) => !c.isPercentage).map((c) => c.label));
    return v.components.filter((c) => c.isPercentage).every((c) => flatLabels.has(c.baseRef));
  },
  {
    message:
      "a percentage component's baseRef must reference a non-percentage sibling component in the same structure",
    path: ['components'],
  }
);

export const updateSalaryStructureSchema = salaryStructureBaseSchema.partial();

export const generateSalarySlipSchema = z.object({
  staffId: objectId,
  month: z.coerce.number().int().min(1).max(12),
  year: z.coerce.number().int().min(2000).max(2100),
});

export const generateBulkSalarySlipSchema = z.object({
  month: z.coerce.number().int().min(1).max(12),
  year: z.coerce.number().int().min(2000).max(2100),
  staffIds: z.array(objectId).optional(),
});

export const markSalarySlipPaidSchema = z.object({
  paidOn: z.coerce.date().optional(),
  notes: z.string().trim().optional(),
});

export const payrollExportQuerySchema = z.object({
  month: z.coerce.number().int().min(1).max(12),
  year: z.coerce.number().int().min(2000).max(2100),
});
