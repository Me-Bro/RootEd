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

// ── Seats ───────────────────────────────────────────────────────────────────

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');

export const seatSchema = z
  .object({
    label: z.string().trim().min(1).max(20),
    zone: z.string().trim().max(40).optional(),
  })
  .strict();

// A rename, a zone change, or taking a chair out of use. A zone sent as an empty
// string is allowed and clears it.
export const updateSeatSchema = z
  .object({
    label: z.string().trim().min(1).max(20).optional(),
    zone: z.string().trim().max(40).optional(),
    isActive: z.boolean().optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, 'Nothing to change');

// "A-" and 6 gives A-1 .. A-6; `start` lets a second batch continue the numbering.
export const bulkSeatSchema = z
  .object({
    prefix: z.string().trim().max(10).default(''),
    count: z.number().int().min(1).max(200),
    start: z.number().int().min(0).max(9999).default(1),
    zone: z.string().trim().max(40).optional(),
  })
  .strict();

export const seatAllocationSchema = z
  .object({ studentId: objectId, sectionId: objectId, seatId: objectId })
  .strict();

export const moveAllocationSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('end') }).strict(),
  z.object({ action: z.literal('move'), seatId: objectId }).strict(),
]);

export const availabilityQuerySchema = z.object({ sectionId: objectId });

export const allocationQuerySchema = z.object({
  studentId: objectId.optional(),
  sectionId: objectId.optional(),
  seatId: objectId.optional(),
});

// Shift hours on a Section. Either may be null (clears it); both are labels.
export const sectionTimesSchema = z
  .object({ startTime: hhmm.nullable().optional(), endTime: hhmm.nullable().optional() })
  .refine((v) => !v.startTime || !v.endTime || v.endTime > v.startTime, {
    message: 'End time must be later than start time',
    path: ['endTime'],
  });

// ── Check-in ────────────────────────────────────────────────────────────────

// The seat is optional: left out, the server picks the first free one.
export const checkInSchema = z
  .object({ studentId: objectId, seatId: objectId.optional() })
  .strict();

export const freeSeatsQuerySchema = z.object({ studentId: objectId });
