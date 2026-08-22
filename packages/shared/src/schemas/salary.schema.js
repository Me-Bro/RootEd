import { z } from 'zod';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');

export const salaryComponentSchema = z
  .object({
    id: z.string().trim().min(1),
    label: z.string().trim().min(1),
    type: z.enum(['earning', 'deduction']),
    amount: z.coerce.number(),
    isPercentage: z.boolean().default(false),
    baseRef: z.string().trim().min(1).optional(),
  })
  .refine((v) => !v.isPercentage || Boolean(v.baseRef), {
    message: 'baseRef is required when isPercentage is true',
    path: ['baseRef'],
  })
  .refine((v) => !v.isPercentage || (v.amount >= 0 && v.amount <= 100), {
    message: 'percentage components must have an amount between 0 and 100',
    path: ['amount'],
  });

const salaryStructureBaseSchema = z.object({
  name: z.string().trim().min(1),
  components: z.array(salaryComponentSchema).min(1),
});

// Components are matched by stable `id`, not `label` — labels are freely
// editable display text and must not be load-bearing for baseRef lookups.
function componentsHaveValidBaseRefs(components) {
  const ids = components.map((c) => c.id);
  if (new Set(ids).size !== ids.length) return false;
  const flatIds = new Set(components.filter((c) => !c.isPercentage).map((c) => c.id));
  return components.filter((c) => c.isPercentage).every((c) => flatIds.has(c.baseRef));
}

const validComponentsRefine = {
  message:
    "components must have unique ids, and every percentage component's baseRef must reference a non-percentage sibling component by id",
  path: ['components'],
};

export const createSalaryStructureSchema = salaryStructureBaseSchema.refine(
  (v) => componentsHaveValidBaseRefs(v.components),
  validComponentsRefine
);

export const updateSalaryStructureSchema = salaryStructureBaseSchema
  .partial()
  .refine(
    (v) => v.components === undefined || componentsHaveValidBaseRefs(v.components),
    validComponentsRefine
  );

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
