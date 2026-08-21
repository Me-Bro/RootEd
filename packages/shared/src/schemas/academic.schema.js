import { z } from 'zod';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');
const dateString = z.coerce.date();

export const markAttendanceSchema = z.object({
  date: dateString,
  sectionId: objectId,
  subjectId: objectId.nullable().optional(),
  records: z
    .array(
      z.object({
        entityId: objectId,
        status: z.enum(['present', 'absent', 'late', 'excused']),
        note: z.string().optional(),
      })
    )
    .min(1),
});

export const attendanceQuerySchema = z.object({
  sectionId: objectId.optional(),
  entityId: objectId.optional(),
  subjectId: objectId.optional(),
  date: dateString.optional(),
  from: dateString.optional(),
  to: dateString.optional(),
});

export const attendanceReportQuerySchema = z.object({
  sectionId: objectId,
  subjectId: objectId.optional(),
  from: dateString.optional(),
  to: dateString.optional(),
});
