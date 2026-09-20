import { z } from 'zod';

export const feedbackSubmitSchema = z.object({
  category: z.enum(['contact', 'feedback', 'bug', 'other']).default('other'),
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email(),
  message: z.string().trim().min(1).max(4000),
});

export const feedbackStatusUpdateSchema = z.object({
  status: z.enum(['new', 'in_progress', 'resolved']),
  adminNote: z.string().trim().max(2000).optional(),
});
