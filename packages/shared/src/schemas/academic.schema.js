import { z } from 'zod';
import { ASSESSMENT_TYPES } from '../constants/index.js';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');
const dateString = z.coerce.date();
const assessmentType = z.enum(ASSESSMENT_TYPES);

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

export const saveGradesSchema = z.object({
  grades: z
    .array(
      z.object({
        studentId: objectId,
        sectionId: objectId,
        subjectId: objectId,
        termId: objectId,
        academicYearId: objectId,
        assessmentType: assessmentType.default('final'),
        score: z.coerce.number().min(0).max(100),
        weightage: z.coerce.number().positive().optional(),
        remarks: z.string().optional(),
      })
    )
    .min(1),
});

export const gradesQuerySchema = z.object({
  studentId: objectId.optional(),
  sectionId: objectId.optional(),
  subjectId: objectId.optional(),
  termId: objectId.optional(),
  assessmentType: assessmentType.optional(),
});

export const gradesReportQuerySchema = z.object({
  sectionId: objectId,
  subjectId: objectId,
  termId: objectId,
  assessmentType: assessmentType.optional(),
});

export const gradeLockSchema = z.object({
  sectionId: objectId,
  subjectId: objectId,
  termId: objectId,
  assessmentType: assessmentType.default('final'),
});

export const reportCardGenerateSchema = z.object({
  sectionId: objectId,
  termId: objectId,
});

export const reportCardHistoryQuerySchema = z.object({
  sectionId: objectId,
  termId: objectId,
});

const timeString = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Invalid time');

export const timetableEntrySchema = z
  .object({
    academicYearId: objectId,
    sectionId: objectId,
    subjectId: objectId,
    teacherId: objectId,
    dayOfWeek: z.coerce.number().int().min(0).max(6),
    periodNumber: z.coerce.number().int().positive(),
    startTime: timeString,
    endTime: timeString,
    room: z.string().trim().min(1).optional(),
  })
  .refine((v) => v.endTime > v.startTime, {
    message: 'endTime must be after startTime',
    path: ['endTime'],
  });

export const timetableQuerySchema = z.object({
  sectionId: objectId.optional(),
  teacherId: objectId.optional(),
  yearId: objectId.optional(),
});

export const copyTimetableSchema = z.object({
  sectionId: objectId,
  fromYearId: objectId,
  toYearId: objectId,
});

export const timetablePublishSchema = z.object({
  academicYearId: objectId,
  sectionId: objectId,
});
