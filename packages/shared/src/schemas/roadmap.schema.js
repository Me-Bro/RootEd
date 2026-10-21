import { z } from 'zod';
import { ROADMAP_ITEM_TYPES, ROADMAP_SCHEDULE_MODES } from '../constants/index.js';
import { unescapeText } from '../utils/index.js';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');
const hasKeys = (value) => Object.keys(value).length > 0;

// sanitizeBody has already run, so text arrives entity-escaped; undo that once,
// here, so every route stores what the person typed.
const text = (max) => z.string().trim().max(max).transform(unescapeText);
const title = z.string().trim().min(1).max(200).transform(unescapeText);

// http(s) only: the link is rendered as an <a href>, so `javascript:` must never
// get this far. Decoded first, because a query string's `&` arrives as `&amp;`.
const httpUrl = z.preprocess(
  unescapeText,
  z
    .string()
    .trim()
    .max(2000)
    .url()
    .refine((u) => /^https?:\/\//i.test(u), 'Link must start with http:// or https://')
);

const dayNumber = z.number().int().min(1).max(1000);
const weekNumber = z.number().int().min(1).max(520);
const date = z.coerce.date();
const idList = (min = 0) =>
  z
    .array(objectId)
    .min(min)
    .max(100)
    .refine((ids) => new Set(ids).size === ids.length, 'Duplicate item');

// ── Roadmaps ────────────────────────────────────────────────────────────────

export const roadmapListQuerySchema = z.object({
  sectionId: objectId.optional(),
  termId: objectId.optional(),
});

export const createRoadmapSchema = z.object({
  sectionId: objectId,
  termId: objectId,
  title,
  description: text(2000).optional(),
  scheduleMode: z.enum(ROADMAP_SCHEDULE_MODES).default('none'),
  // Anchor for daily/weekly roadmaps; the route falls back to the term's start.
  startDate: date.optional(),
  published: z.boolean().default(false),
});

// Strict: a roadmap belongs to one batch and term for life, and its items
// reference it.
export const updateRoadmapSchema = z
  .object({
    title: title.optional(),
    description: text(2000).optional(),
    scheduleMode: z.enum(ROADMAP_SCHEDULE_MODES).optional(),
    startDate: date.nullable().optional(),
    published: z.boolean().optional(),
  })
  .strict()
  .refine(hasKeys, 'Nothing to update');

// ── Items ───────────────────────────────────────────────────────────────────

const itemFields = {
  type: z.enum(ROADMAP_ITEM_TYPES),
  title,
  body: text(10000).optional(),
  resourceUrl: httpUrl.optional(),
  // The question a student answers on this item.
  prompt: text(2000).optional(),
  dueDate: date.optional(),
  dayNumber: dayNumber.optional(),
  weekNumber: weekNumber.optional(),
  // locked with no unlockAfter is a hold the mentor lifts by hand.
  locked: z.boolean().default(false),
  unlockAfter: idList().default([]),
};

const needsLock = (v) => !v.unlockAfter?.length || v.locked !== false;
const needsLockMessage = { message: 'Prerequisites only apply to a locked item', path: ['locked'] };

export const createRoadmapItemSchema = z.object(itemFields).refine(needsLock, needsLockMessage);

export const updateRoadmapItemSchema = z
  .object({
    type: itemFields.type.optional(),
    title: title.optional(),
    body: text(10000).nullable().optional(),
    resourceUrl: httpUrl.nullable().optional(),
    prompt: text(2000).nullable().optional(),
    dueDate: date.nullable().optional(),
    dayNumber: dayNumber.nullable().optional(),
    weekNumber: weekNumber.nullable().optional(),
    locked: z.boolean().optional(),
    unlockAfter: idList().optional(),
  })
  .strict()
  .refine(hasKeys, 'Nothing to update')
  .refine(needsLock, needsLockMessage);

export const reorderRoadmapItemsSchema = z.object({ itemIds: idList(1) }).strict();

/**
 * Message when an item's schedule fields do not fit its roadmap's mode, else
 * null. A dated roadmap needs exactly a date, a daily one a day number, a
 * weekly one a week number, and an unscheduled one none of them.
 */
export function scheduleFieldError(mode, { dueDate, dayNumber, weekNumber }) {
  const wanted = { dated: 'dueDate', daily: 'dayNumber', weekly: 'weekNumber', none: null }[mode];
  const given = { dueDate, dayNumber, weekNumber };
  const present = Object.keys(given).filter((k) => given[k] != null);
  if (wanted === null) {
    return present.length ? `A roadmap without a timeline takes no ${present[0]}` : null;
  }
  if (!present.includes(wanted)) return `A ${mode} roadmap needs ${wanted}`;
  const extra = present.find((k) => k !== wanted);
  return extra ? `A ${mode} roadmap takes ${wanted}, not ${extra}` : null;
}

// ── A student's own progress on one item ────────────────────────────────────

// Strict on purpose: the student comes from the session, never the body.
export const roadmapProgressUpdateSchema = z
  .object({
    completed: z.boolean().optional(),
    answer: text(5000).optional(),
    linkUrl: httpUrl.nullable().optional(),
  })
  .strict()
  .refine(hasKeys, 'Nothing to update');

export const myRoadmapQuerySchema = z.object({ termId: objectId.optional() });
