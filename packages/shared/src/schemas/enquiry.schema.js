import { z } from 'zod';
import { ENQUIRY_PROGRAMMES, ENQUIRY_STATUSES } from '../constants/index.js';

// Spaces, dashes, dots and brackets are how people type a number; keep only a
// leading + and the digits so the stored value is comparable.
const phone = z
  .string()
  .trim()
  .transform((v) => v.replace(/[\s\-.()]/g, ''))
  .pipe(z.string().regex(/^\+?\d{7,15}$/, 'Enter a valid phone number'));

export const enquirySubmitSchema = z
  .object({
    contactName: z.string().trim().min(1, 'Enter your name').max(120),
    collegeName: z.string().trim().min(1, 'Enter your college name').max(200),
    email: z.string().trim().email('Enter a valid email address').max(254),
    phone,
    programme: z.enum(ENQUIRY_PROGRAMMES).default('not_sure'),
    message: z.string().trim().max(2000).optional(),
    // Honeypot: hidden from people, filled in by form-stuffing bots.
    website: z.string().optional(),
  })
  .strict();

export const enquiryStatusUpdateSchema = z.object({
  status: z.enum(ENQUIRY_STATUSES),
  adminNote: z.string().trim().max(2000).optional(),
});
