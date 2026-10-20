import { z } from 'zod';
import { PLACEMENT_STAGES, COMPLETION_STATUSES } from '../constants/index.js';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');
const dateString = z.coerce.date();
const title = z.string().trim().min(1).max(200);
const hasKeys = (value) => Object.keys(value).length > 0;

export const trainingListQuerySchema = z.object({
  sectionId: objectId.optional(),
  termId: objectId.optional(),
  subjectId: objectId.optional(),
});

// ── Assignments ─────────────────────────────────────────────────────────────

export const createAssignmentSchema = z.object({
  sectionId: objectId,
  subjectId: objectId,
  termId: objectId,
  title,
  description: z.string().trim().max(2000).optional(),
  dueDate: dateString,
  maxScore: z.number().positive().max(1000).default(10),
});

// Strict on purpose: an assignment belongs to one batch, module and term for
// life. Re-pointing it would silently re-home every submission under it.
export const updateAssignmentSchema = z
  .object({
    title: title.optional(),
    description: z.string().trim().max(2000).optional(),
    dueDate: dateString.optional(),
    maxScore: z.number().positive().max(1000).optional(),
  })
  .strict()
  .refine(hasKeys, 'Nothing to update');

export const upsertSubmissionSchema = z
  .object({
    status: z.enum(['pending', 'submitted', 'reviewed']),
    score: z.number().min(0).max(1000).optional(),
    feedback: z.string().trim().max(2000).optional(),
  })
  .refine((v) => v.status !== 'reviewed' || v.score !== undefined, {
    message: 'A reviewed submission needs a score',
    path: ['score'],
  });

// ── Projects ────────────────────────────────────────────────────────────────

const repoUrl = z
  .string()
  .url()
  .refine((u) => /^https?:\/\//i.test(u), 'Repository URL must be http(s)');

const milestone = z.object({
  title,
  dueDate: dateString.optional(),
  doneAt: dateString.nullable().optional(),
});

const memberIds = z
  .array(objectId)
  .refine((ids) => new Set(ids).size === ids.length, 'Duplicate team member');

export const createProjectSchema = z.object({
  sectionId: objectId,
  termId: objectId,
  name: title,
  repoUrl: repoUrl.optional(),
  memberIds: memberIds.default([]),
  milestones: z.array(milestone).default([]),
  demoDate: dateString.optional(),
});

export const updateProjectSchema = z
  .object({
    name: title.optional(),
    repoUrl: repoUrl.nullable().optional(),
    memberIds: memberIds.optional(),
    milestones: z.array(milestone).optional(),
    demoDate: dateString.nullable().optional(),
    reviewScore: z.number().min(0).max(100).nullable().optional(),
    reviewNotes: z.string().trim().max(4000).optional(),
  })
  .strict()
  .refine(hasKeys, 'Nothing to update');

// ── Employers and placement ─────────────────────────────────────────────────

const shortText = (max) => z.string().trim().max(max);

export const createEmployerSchema = z.object({
  name: title,
  contactName: shortText(200).optional(),
  contactEmail: z.string().trim().email().max(200).optional(),
  contactPhone: shortText(40).optional(),
  notes: shortText(2000).optional(),
});

// Strict and partial: `active: false` retires an employer without deleting the
// applications that point at it.
export const updateEmployerSchema = z
  .object({
    name: title.optional(),
    contactName: shortText(200).optional(),
    contactEmail: z.string().trim().email().max(200).optional(),
    contactPhone: shortText(40).optional(),
    notes: shortText(2000).optional(),
    active: z.boolean().optional(),
  })
  .strict()
  .refine(hasKeys, 'Nothing to update');

export const createPlacementSchema = z.object({
  studentId: objectId,
  employerId: objectId,
  role: title,
  appliedAt: dateString.optional(),
  notes: shortText(2000).optional(),
});

export const movePlacementSchema = z
  .object({
    stage: z.enum(PLACEMENT_STAGES),
    at: dateString.optional(),
    notes: shortText(2000).optional(),
  })
  .strict();

export const placementQuerySchema = z.object({
  sectionId: objectId.optional(),
  stage: z.enum(PLACEMENT_STAGES).optional(),
});

export const consentSchema = z.object({ granted: z.boolean() }).strict();

// ── Completion (an admin's decision, stored on Enrollment) ──────────────────

export const completionSchema = z
  .object({
    studentId: objectId,
    sectionId: objectId,
    status: z.enum(COMPLETION_STATUSES),
    notes: shortText(1000).optional(),
  })
  .strict();

export const batchQuerySchema = z.object({ sectionId: objectId });
