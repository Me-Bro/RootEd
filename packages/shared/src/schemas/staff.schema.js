import { z } from 'zod';

// Plain HTML forms (react-hook-form included) submit untouched optional
// fields as '' rather than omitting them — treat '' the same as "not
// provided" before the inner schema's own validation (min length, enum, coerce.date) runs.
function optional(schema) {
  return z.preprocess((v) => (v === '' ? undefined : v), schema.optional());
}

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');
const dateString = z.coerce.date();
const genderEnum = z.enum(['male', 'female', 'other']);
export const EMPLOYMENT_STATUSES = ['active', 'resigned', 'terminated', 'on_leave'];
const employmentStatus = z.enum(EMPLOYMENT_STATUSES);

export const createStaffMemberSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  firstName: z.string().trim().min(1),
  lastName: z.string().trim().min(1),
  employeeId: optional(z.string().trim().min(1)),
  designation: optional(z.string().trim().min(1)),
  department: optional(z.string().trim().min(1)),
  joiningDate: optional(dateString),
  phone: optional(z.string().trim().min(1)),
  address: optional(z.string().trim().min(1)),
  dateOfBirth: optional(dateString),
  gender: optional(genderEnum),
  reportingManagerId: optional(objectId),
  governmentId: optional(z.string().trim().min(1)),
  bankAccount: optional(z.string().trim().min(1)),
  salaryStructureId: optional(objectId),
});

export const patchStaffMemberSchema = z.object({
  firstName: optional(z.string().trim().min(1)),
  lastName: optional(z.string().trim().min(1)),
  employeeId: optional(z.string().trim().min(1)),
  designation: optional(z.string().trim().min(1)),
  department: optional(z.string().trim().min(1)),
  joiningDate: optional(dateString),
  phone: optional(z.string().trim().min(1)),
  address: optional(z.string().trim().min(1)),
  dateOfBirth: optional(dateString),
  gender: optional(genderEnum),
  reportingManagerId: optional(objectId),
  employmentStatus: optional(employmentStatus),
  governmentId: optional(z.string().trim().min(1)),
  bankAccount: optional(z.string().trim().min(1)),
  salaryStructureId: optional(objectId),
});

export const staffCsvRowSchema = z.object({
  firstName: z.string().trim().min(1),
  lastName: z.string().trim().min(1),
  email: z.string().trim().toLowerCase().email(),
  employeeId: optional(z.string().trim().min(1)),
  designation: optional(z.string().trim().min(1)),
  department: optional(z.string().trim().min(1)),
  joiningDate: optional(z.string().trim().min(1)),
  phone: optional(z.string().trim().min(1)),
});
