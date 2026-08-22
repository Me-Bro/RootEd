import { z } from 'zod';

function optional(schema) {
  return z.preprocess((v) => (v === '' ? undefined : v), schema.optional());
}

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');

export const createLeaveRequestSchema = z
  .object({
    staffId: objectId,
    leaveTypeId: objectId,
    fromDate: z.coerce.date(),
    toDate: z.coerce.date(),
    reason: optional(z.string().trim().min(1).max(500)),
  })
  .refine((data) => data.toDate >= data.fromDate, {
    message: 'toDate must be on or after fromDate',
    path: ['toDate'],
  });

export const rejectLeaveRequestSchema = z.object({
  comment: optional(z.string().trim().min(1).max(500)),
});

export const createLeaveTypeSchema = z.object({
  name: z.string().trim().min(1),
  maxDaysPerYear: z.coerce.number().int().positive(),
  isPaid: z.coerce.boolean().optional(),
  requiresApproval: z.coerce.boolean().optional(),
});

export const patchLeaveTypeSchema = z.object({
  name: optional(z.string().trim().min(1)),
  maxDaysPerYear: optional(z.coerce.number().int().positive()),
  isPaid: optional(z.coerce.boolean()),
  requiresApproval: optional(z.coerce.boolean()),
});
