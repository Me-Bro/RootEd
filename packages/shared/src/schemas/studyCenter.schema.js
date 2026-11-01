import { z } from 'zod';

// Stored form of an Indian mobile number: ten digits, first digit 6-9. Accepts
// what people type at a desk (spaces, dashes, a leading +91 or 0) and returns
// the ten digits, so a repeat visitor is found whichever way their number is typed.
export function normalizeIndianMobile(input) {
  let digits = String(input ?? '').replace(/[\s-]/g, '');
  if (digits.startsWith('+91')) digits = digits.slice(3);
  else if (digits.startsWith('0')) digits = digits.slice(1);
  return digits;
}

export const indianMobileSchema = z
  .string()
  .trim()
  .transform(normalizeIndianMobile)
  .refine((v) => /^[6-9]\d{9}$/.test(v), 'Enter a valid 10-digit mobile number');

// A walk-in is a visitor who leaves a name and a phone at the desk.
export const walkInSchema = z
  .object({
    firstName: z.string().trim().min(1).max(100),
    lastName: z.string().trim().min(1).max(100),
    phone: indianMobileSchema,
  })
  .strict();

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:mm, 24-hour');
export const DISCOUNT_POLICIES = ['staff', 'desk', 'owner'];

// Who may apply a discount (see utils/centreSettings in the API) and when the
// centre is open. Overnight windows are not supported: closeTime must be later
// than openTime unless the centre is open 24 hours.
export const centreSettingsSchema = z
  .object({
    openTime: hhmm.optional(),
    closeTime: hhmm.optional(),
    open24h: z.boolean().optional(),
    discountPolicy: z.enum(DISCOUNT_POLICIES).optional(),
  })
  .strict()
  .refine((v) => v.open24h || !v.openTime || !v.closeTime || v.closeTime > v.openTime, {
    message: 'Closing time must be later than opening time',
    path: ['closeTime'],
  });
