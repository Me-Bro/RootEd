import { z } from 'zod';
import { indianMobileSchema } from './studyCenter.schema.js';
import { isValidAadhaar, normalizeAadhaar, studentGroupFor } from '../utils/student.js';

export const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
export const STUDENT_CATEGORIES = ['general', 'obc', 'sc', 'st', 'ews', 'other'];
export const STUDENT_STATUSES = ['active', 'graduated', 'withdrawn'];
export const MAX_GUARDIANS = 5;
// What an uploaded file on a student is. A resume is what a placement team asks for.
export const DOCUMENT_KINDS = ['resume', 'transfer_certificate', 'id_proof', 'medical', 'other'];

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');

// A form sends '' for a field the user left empty. On create that means "not
// given", so the key is dropped. On update it means "clear this", so the blank
// is kept and the route unsets the field; anything else is checked by `schema`.
function field(schema, mode) {
  if (mode === 'create') return z.preprocess((v) => (v === '' ? undefined : v), schema.optional());
  return z
    .any()
    .transform((v, ctx) => {
      if (v === undefined || (typeof v === 'string' && v.trim() === ''))
        return v === undefined ? v : '';
      const result = schema.safeParse(v);
      if (result.success) return result.data;
      for (const issue of result.error.issues)
        ctx.addIssue({ code: 'custom', message: issue.message });
      return z.NEVER;
    })
    .optional();
}

const text = (max) => z.string().trim().max(max);

const pastDate = z
  .string()
  .trim()
  .refine((v) => !Number.isNaN(Date.parse(v)), 'Enter a valid date')
  .refine(
    (v) => Number.isNaN(Date.parse(v)) || new Date(v) <= new Date(),
    'Date cannot be in the future'
  );

const aadhaar = z
  .string()
  .trim()
  .refine(isValidAadhaar, 'Enter a valid 12-digit Aadhaar number')
  .transform(normalizeAadhaar);

// One guardian. Fields are always "blank means not given": a contact row is
// replaced as a whole, never patched key by key. A row read back from the API
// carries its Mongo _id; it is accepted and dropped, since the list is replaced.
const contactSchema = z
  .object({
    _id: z.string().optional(),
    name: z.string().trim().min(1, 'Guardian name is required').max(100),
    phone: field(indianMobileSchema, 'create'),
    relation: field(text(50), 'create'),
    email: field(z.string().trim().toLowerCase().email(), 'create'),
    whatsappNumber: field(indianMobileSchema, 'create'),
    whatsappSameAsPhone: z.boolean().optional(),
    isPrimary: z.boolean().optional(),
    isEmergency: z.boolean().optional(),
  })
  .strict()
  .superRefine((c, ctx) => {
    if (!c.phone && !c.email && !c.whatsappNumber) {
      ctx.addIssue({
        code: 'custom',
        path: ['phone'],
        message: 'Add a phone number or email for this guardian',
      });
    }
    if (c.whatsappSameAsPhone && !c.phone) {
      ctx.addIssue({
        code: 'custom',
        path: ['whatsappSameAsPhone'],
        message: 'Add a phone number first',
      });
    }
  })
  .transform(({ _id, ...contact }) => contact);

const parentContactsSchema = z
  .array(contactSchema)
  .max(MAX_GUARDIANS, `At most ${MAX_GUARDIANS} guardians`)
  .superRefine((contacts, ctx) => {
    if (contacts.filter((c) => c.isPrimary).length > 1) {
      ctx.addIssue({ code: 'custom', message: 'Only one guardian can be primary' });
    }
  });

const addressSchema = z
  .object({
    line1: field(text(200), 'create'),
    line2: field(text(200), 'create'),
    city: field(text(100), 'create'),
    state: field(text(100), 'create'),
    pincode: field(
      z
        .string()
        .trim()
        .regex(/^[1-9]\d{5}$/, 'Enter a valid 6-digit PIN code'),
      'create'
    ),
  })
  .strict();

// Extra fields an org type collects, on top of the common ones (see
// studentGroupFor). Keyed by group, so the API and the forms agree on what is
// allowed for a tenant.
const GROUP_SHAPES = {
  school: (f) => ({
    previousSchool: f(text(150)),
    tcNumber: f(text(50)),
    motherTongue: f(text(50)),
    nationality: f(text(50)),
    transportRoute: f(text(100)),
    transportStop: f(text(100)),
    category: f(z.enum(STUDENT_CATEGORIES)),
  }),
  batch: (f) => ({
    examTarget: f(text(100)),
    joiningSource: f(text(100)),
  }),
  college: (f) => ({
    college: f(text(150)),
    branch: f(text(100)),
    graduationYear: f(z.coerce.number().int().min(1990).max(2100)),
    skills: z.array(z.string().trim().min(1).max(50)).max(30).optional(),
  }),
};

function build(mode, orgType) {
  const f = (schema) => field(schema, mode);
  const create = mode === 'create';
  const name = z.string().trim().min(1).max(100);

  const shape = {
    firstName: create ? name : name.optional(),
    lastName: create ? name : name.optional(),
    sectionId: f(objectId),
    dateOfBirth: f(pastDate),
    gender: f(z.enum(['male', 'female', 'other'])),
    phone: f(indianMobileSchema),
    whatsappNumber: f(indianMobileSchema),
    whatsappSameAsPhone: z.boolean().optional(),
    aadhaar: f(aadhaar),
    parentContacts: parentContactsSchema.optional(),
    address: addressSchema.optional(),
    admissionDate: f(pastDate),
    bloodGroup: f(z.enum(BLOOD_GROUPS)),
    allergies: f(text(500)),
    medicalNotes: f(text(1000)),
    ...GROUP_SHAPES[studentGroupFor(orgType)](f),
  };

  if (create) {
    // The admission number is the student's identity in the roster and in
    // imports, so it is set once and never patched. A new student is always
    // active; status and its reason only change through an update.
    shape.admissionNo = z.string().trim().min(1).max(50);
    shape.email = f(z.string().trim().toLowerCase().email());
  } else {
    shape.status = z.enum(STUDENT_STATUSES).optional();
    shape.statusReason = f(text(200));
  }

  const object = z.object(shape).strict();
  // On update the phone may already be stored, so the route checks this against
  // the merged record instead.
  return create
    ? object.superRefine((s, ctx) => {
        if (s.whatsappSameAsPhone && !s.phone) {
          ctx.addIssue({
            code: 'custom',
            path: ['whatsappSameAsPhone'],
            message: 'Add a phone number first',
          });
        }
      })
    : object;
}

export const studentCreateSchemaFor = (orgType) => build('create', orgType);
export const studentUpdateSchemaFor = (orgType) => build('update', orgType);

// Names of the extra fields this org type collects.
export function studentFieldsFor(orgType) {
  return Object.keys(GROUP_SHAPES[studentGroupFor(orgType)]((s) => s));
}
