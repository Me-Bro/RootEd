import { z } from 'zod';
import { CENTRE_EXPENSE_CATEGORIES } from '../constants/index.js';

const PAYMENT_METHODS = ['cash', 'card', 'bank_transfer', 'upi'];

// A study center's expense: one owner, no approval chain, so it is saved as approved.
// `date` is the day the money was spent on the centre's calendar (YYYY-MM-DD); the
// server defaults it to today. `title` is optional because the category usually says it.
export const createCentreExpenseSchema = z
  .object({
    category: z.enum(CENTRE_EXPENSE_CATEGORIES),
    amount: z.coerce.number().positive().max(100_000_000),
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
      .optional(),
    title: z.string().trim().max(200).optional(),
    paymentMethod: z.enum(PAYMENT_METHODS).optional(),
    vendor: z.string().trim().max(200).optional(),
  })
  .strict();

export const updateCentreExpenseSchema = createCentreExpenseSchema.partial().strict();

const monthString = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use YYYY-MM');

// ?month=YYYY-MM on a finance report; the server defaults it to this month on the
// centre's own calendar.
export const financeMonthQuerySchema = z.object({ month: monthString.optional() });

// Pending fees: per learner (`student`, optionally searched by name, admission number
// or phone) or per month (`month`, the last `months` months that had anything billed).
export const pendingFeesQuerySchema = z.object({
  view: z.enum(['student', 'month']).default('student'),
  q: z.string().trim().max(100).optional(),
  months: z.coerce.number().int().min(1).max(36).default(12),
});
