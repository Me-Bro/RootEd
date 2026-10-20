import { z } from 'zod';

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
