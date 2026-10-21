import { Roadmap } from '../models/Roadmap.js';
import { RoadmapItem } from '../models/RoadmapItem.js';
import { RoadmapProgress } from '../models/RoadmapProgress.js';
import { AppError } from '../middleware/errorHandler.js';
import { isOpen, unmetPrerequisites } from '../utils/roadmapLock.js';

/**
 * A student's view of their batch's published roadmaps, with their own progress
 * and which items are open. A closed item carries only what is needed to show
 * why it is closed: its body, prompt and link stay on the server until it opens.
 */
export async function getMyRoadmaps(tenantId, { studentId, sectionId, termId }) {
  if (!sectionId) return [];

  const filter = { tenantId, sectionId, published: true };
  if (termId) filter.termId = termId;
  const roadmaps = await Roadmap.find(filter).sort({ createdAt: 1 }).lean();
  if (!roadmaps.length) return [];

  const roadmapIds = roadmaps.map((r) => r._id);
  const [items, progress] = await Promise.all([
    RoadmapItem.find({ tenantId, roadmapId: { $in: roadmapIds } })
      .sort({ order: 1 })
      .lean(),
    RoadmapProgress.find({ tenantId, studentId, roadmapId: { $in: roadmapIds } }).lean(),
  ]);

  const progressByItem = new Map(progress.map((p) => [String(p.itemId), p]));
  const completed = new Set(progress.filter((p) => p.completedAt).map((p) => String(p.itemId)));
  const titleOf = new Map(items.map((i) => [String(i._id), i.title]));

  return roadmaps.map((roadmap) => ({
    ...roadmap,
    items: items
      .filter((i) => String(i.roadmapId) === String(roadmap._id))
      .map((item) => shapeItem(item, progressByItem.get(String(item._id)), completed, titleOf)),
  }));
}

function shapeItem(item, progress, completed, titleOf) {
  const open = isOpen(item, completed);
  const shaped = {
    _id: item._id,
    roadmapId: item.roadmapId,
    type: item.type,
    title: item.title,
    order: item.order,
    dueDate: item.dueDate,
    dayNumber: item.dayNumber,
    weekNumber: item.weekNumber,
    locked: item.locked,
    open,
    waitingOn: open ? [] : unmetPrerequisites(item, completed).map((id) => titleOf.get(id)),
    completed: Boolean(progress?.completedAt),
    completedAt: progress?.completedAt ?? null,
    answer: progress?.answer ?? null,
    linkUrl: progress?.linkUrl ?? null,
  };
  if (open) {
    shaped.body = item.body;
    shaped.prompt = item.prompt;
    shaped.resourceUrl = item.resourceUrl;
  }
  return shaped;
}

/**
 * Records one student's work on one item of their own batch. Returns the stored
 * progress. 404 when the item is not on a published roadmap of the student's
 * batch (never a hint that it exists elsewhere); 409 while it is closed.
 */
export async function saveMyProgress(tenantId, { studentId, sectionId, itemId, changes }) {
  if (!sectionId) throw new AppError('Not found', 404);

  const item = await RoadmapItem.findOne({ _id: itemId, tenantId, sectionId }).lean();
  const roadmap = item
    ? await Roadmap.findOne({ _id: item.roadmapId, tenantId, published: true }).lean()
    : null;
  if (!roadmap) throw new AppError('Not found', 404);

  const { completed, answer, linkUrl } = changes;
  if (linkUrl !== undefined && item.type !== 'assignment') {
    throw new AppError('Only an assignment takes a link', 400);
  }

  // A closed item can only be un-ticked: nothing may be added to it until it opens.
  const undoOnly = completed === false && answer === undefined && linkUrl === undefined;
  if (!undoOnly) {
    const siblings = await RoadmapItem.find({ tenantId, roadmapId: roadmap._id }).lean();
    const done = await RoadmapProgress.find(
      { tenantId, studentId, roadmapId: roadmap._id, completedAt: { $ne: null } },
      'itemId'
    ).lean();
    const completedIds = done.map((p) => String(p.itemId));
    const self = siblings.find((s) => String(s._id) === String(item._id));
    if (!isOpen(self, completedIds)) throw new AppError('Item is locked', 409);
  }

  const key = { tenantId, itemId: item._id, studentId };
  const fields = {};
  if (answer !== undefined) fields.answer = answer;
  if (linkUrl !== undefined) fields.linkUrl = linkUrl ?? '';

  // The unique {item, student} index makes two taps at once collide on insert;
  // the loser simply retries as an update.
  const upsert = () =>
    RoadmapProgress.findOneAndUpdate(
      key,
      { $set: fields, $setOnInsert: { roadmapId: roadmap._id } },
      { upsert: true, new: true }
    );
  try {
    await upsert();
  } catch (err) {
    if (err?.code !== 11000) throw err;
    await upsert();
  }

  // completedAt is stamped once: ticking an already-complete item keeps its date.
  if (completed === true) {
    await RoadmapProgress.updateOne(
      { ...key, completedAt: null },
      { $set: { completedAt: new Date() } }
    );
  } else if (completed === false) {
    await RoadmapProgress.updateOne(key, { $set: { completedAt: null } });
  }

  return RoadmapProgress.findOne(key, 'itemId completedAt answer linkUrl').lean();
}
