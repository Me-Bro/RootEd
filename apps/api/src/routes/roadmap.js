import { Router } from 'express';
import mongoose from 'mongoose';
import {
  roadmapListQuerySchema,
  createRoadmapSchema,
  updateRoadmapSchema,
  createRoadmapItemSchema,
  updateRoadmapItemSchema,
  reorderRoadmapItemsSchema,
  scheduleFieldError,
} from '@rooted/shared/schemas';
import { authenticate } from '../middleware/authenticate.js';
import { requirePermission } from '../middleware/requirePermission.js';
import { validate } from '../middleware/validate.js';
import { AppError } from '../middleware/errorHandler.js';
import { Roadmap } from '../models/Roadmap.js';
import { RoadmapItem } from '../models/RoadmapItem.js';
import { RoadmapProgress } from '../models/RoadmapProgress.js';
import { auditLog } from '../services/audit.service.js';
import { assertRefs } from '../services/training.service.js';
import { hasCycle } from '../utils/roadmapLock.js';

/**
 * Mentor side of the learning roadmap, mounted at /training/roadmaps. Reads need
 * training:read, every change training:write. Students reach their own roadmap
 * only through /me/roadmap.
 */
const router = Router();

router.use(authenticate);

// A malformed id is a 404, not a CastError turned into a 500.
for (const param of ['id', 'itemId']) {
  router.param(param, (_req, _res, next, value) =>
    mongoose.isValidObjectId(value) ? next() : next(new AppError('Not found', 404))
  );
}

const audit = (req, action, target, extra = {}) =>
  auditLog({
    actorId: req.user.sub,
    tenantId: req.tenant._id.toString(),
    action,
    target,
    ip: req.ip,
    ...extra,
  });

async function findRoadmap(tenantId, id) {
  const roadmap = await Roadmap.findOne({ _id: id, tenantId }).lean();
  if (!roadmap) throw new AppError('Not found', 404);
  return roadmap;
}

// Fields an update may clear by sending null.
const CLEARABLE = ['body', 'resourceUrl', 'prompt', 'dueDate', 'dayNumber', 'weekNumber'];

/** The item as it would be after `patch`, treating null as "cleared". */
function mergeItem(item, patch) {
  const merged = { ...item, ...patch };
  for (const key of CLEARABLE) if (merged[key] === null) delete merged[key];
  return merged;
}

/**
 * Checks an item (as it would be saved) against its roadmap: the schedule field
 * must match the mode, prerequisites need a lock, and every prerequisite must be
 * another item of this roadmap that does not lead back to this one.
 */
async function assertItemValid(roadmap, item, siblings) {
  const scheduleError = scheduleFieldError(roadmap.scheduleMode, item);
  if (scheduleError) throw new AppError(scheduleError, 400);

  const unlockAfter = (item.unlockAfter ?? []).map(String);
  if (unlockAfter.length && !item.locked) {
    throw new AppError('Prerequisites only apply to a locked item', 400);
  }
  const known = new Set(siblings.map((s) => String(s._id)));
  if (unlockAfter.some((id) => !known.has(id))) {
    throw new AppError('A prerequisite is not an item of this roadmap', 400);
  }
  const others = siblings.filter((s) => String(s._id) !== String(item._id));
  if (hasCycle([...others, { _id: item._id, unlockAfter }])) {
    throw new AppError('Prerequisites cannot loop back to the item itself', 400);
  }
}

// ── Roadmaps ──────────────────────────────────────────────────────────────────

router.get('/', requirePermission('training:read'), async (req, res, next) => {
  try {
    const tenantId = req.tenant._id;
    const filter = { tenantId, ...roadmapListQuerySchema.parse(req.query) };
    const roadmaps = await Roadmap.find(filter).sort({ createdAt: 1 }).limit(200).lean();

    const counts = await RoadmapItem.aggregate([
      { $match: { tenantId, roadmapId: { $in: roadmaps.map((r) => r._id) } } },
      { $group: { _id: '$roadmapId', n: { $sum: 1 } } },
    ]);
    const byRoadmap = new Map(counts.map((c) => [String(c._id), c.n]));
    res.json(roadmaps.map((r) => ({ ...r, itemCount: byRoadmap.get(String(r._id)) ?? 0 })));
  } catch (err) {
    next(err);
  }
});

router.post(
  '/',
  requirePermission('training:write'),
  validate(createRoadmapSchema),
  async (req, res, next) => {
    try {
      const tenantId = req.tenant._id;
      await assertRefs(tenantId, req.body);
      const roadmap = await Roadmap.create({ ...req.body, tenantId, createdBy: req.user.sub });
      await audit(req, 'training.roadmap.create', { model: 'Roadmap', id: roadmap._id });
      res.status(201).json(roadmap);
    } catch (err) {
      next(err);
    }
  }
);

router.get('/:id', requirePermission('training:read'), async (req, res, next) => {
  try {
    const tenantId = req.tenant._id;
    const roadmap = await findRoadmap(tenantId, req.params.id);
    const items = await RoadmapItem.find({ tenantId, roadmapId: roadmap._id })
      .sort({ order: 1 })
      .lean();
    res.json({ ...roadmap, items });
  } catch (err) {
    next(err);
  }
});

router.patch(
  '/:id',
  requirePermission('training:write'),
  validate(updateRoadmapSchema),
  async (req, res, next) => {
    try {
      const tenantId = req.tenant._id;
      const before = await findRoadmap(tenantId, req.params.id);

      // Items carry the schedule field of the old mode; re-moding them would
      // leave every one invalid.
      if (
        req.body.scheduleMode &&
        req.body.scheduleMode !== before.scheduleMode &&
        (await RoadmapItem.exists({ tenantId, roadmapId: before._id }))
      ) {
        throw new AppError('Remove the items before changing the timeline mode', 409);
      }

      const { startDate, ...rest } = req.body;
      const update = { $set: rest };
      if (startDate === null) update.$unset = { startDate: 1 };
      else if (startDate) update.$set.startDate = startDate;

      const roadmap = await Roadmap.findOneAndUpdate({ _id: before._id, tenantId }, update, {
        new: true,
        runValidators: true,
      });
      await audit(
        req,
        'training.roadmap.update',
        { model: 'Roadmap', id: before._id },
        { before, after: roadmap.toObject() }
      );
      res.json(roadmap);
    } catch (err) {
      next(err);
    }
  }
);

router.delete('/:id', requirePermission('training:write'), async (req, res, next) => {
  try {
    const tenantId = req.tenant._id;
    const roadmap = await findRoadmap(tenantId, req.params.id);
    await Promise.all([
      RoadmapProgress.deleteMany({ tenantId, roadmapId: roadmap._id }),
      RoadmapItem.deleteMany({ tenantId, roadmapId: roadmap._id }),
    ]);
    await Roadmap.deleteOne({ _id: roadmap._id, tenantId });
    await audit(req, 'training.roadmap.delete', { model: 'Roadmap', id: roadmap._id });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// ── Items ─────────────────────────────────────────────────────────────────────

router.post(
  '/:id/items',
  requirePermission('training:write'),
  validate(createRoadmapItemSchema),
  async (req, res, next) => {
    try {
      const tenantId = req.tenant._id;
      const roadmap = await findRoadmap(tenantId, req.params.id);
      const siblings = await RoadmapItem.find({ tenantId, roadmapId: roadmap._id }, '_id order')
        .sort({ order: -1 })
        .lean();

      const _id = new mongoose.Types.ObjectId();
      await assertItemValid(roadmap, { ...req.body, _id }, siblings);

      const item = await RoadmapItem.create({
        ...req.body,
        _id,
        tenantId,
        roadmapId: roadmap._id,
        sectionId: roadmap.sectionId,
        order: (siblings[0]?.order ?? 0) + 1,
      });
      await audit(req, 'training.roadmap.item.create', {
        model: 'RoadmapItem',
        id: item._id,
      });
      res.status(201).json(item);
    } catch (err) {
      next(err);
    }
  }
);

// Declared before /:id/items/:itemId so "order" is never read as an item id.
router.put(
  '/:id/items/order',
  requirePermission('training:write'),
  validate(reorderRoadmapItemsSchema),
  async (req, res, next) => {
    try {
      const tenantId = req.tenant._id;
      const roadmap = await findRoadmap(tenantId, req.params.id);
      const items = await RoadmapItem.find({ tenantId, roadmapId: roadmap._id }, '_id').lean();

      const { itemIds } = req.body;
      const known = new Set(items.map((i) => String(i._id)));
      if (itemIds.length !== known.size || itemIds.some((id) => !known.has(id))) {
        throw new AppError('Send every item of the roadmap exactly once', 400);
      }

      await RoadmapItem.bulkWrite(
        itemIds.map((id, index) => ({
          updateOne: { filter: { _id: id, tenantId }, update: { $set: { order: index + 1 } } },
        }))
      );
      await audit(req, 'training.roadmap.reorder', { model: 'Roadmap', id: roadmap._id });
      res.json(await RoadmapItem.find({ tenantId, roadmapId: roadmap._id }).sort({ order: 1 }));
    } catch (err) {
      next(err);
    }
  }
);

router.patch(
  '/:id/items/:itemId',
  requirePermission('training:write'),
  validate(updateRoadmapItemSchema),
  async (req, res, next) => {
    try {
      const tenantId = req.tenant._id;
      const roadmap = await findRoadmap(tenantId, req.params.id);
      const siblings = await RoadmapItem.find({ tenantId, roadmapId: roadmap._id }).lean();
      const before = siblings.find((s) => String(s._id) === req.params.itemId);
      if (!before) throw new AppError('Not found', 404);

      await assertItemValid(roadmap, mergeItem(before, req.body), siblings);

      const $set = {};
      const $unset = {};
      for (const [key, value] of Object.entries(req.body)) {
        if (value === null) $unset[key] = 1;
        else $set[key] = value;
      }
      const update = {};
      if (Object.keys($set).length) update.$set = $set;
      if (Object.keys($unset).length) update.$unset = $unset;

      const item = await RoadmapItem.findOneAndUpdate({ _id: before._id, tenantId }, update, {
        new: true,
        runValidators: true,
      });
      await audit(
        req,
        'training.roadmap.item.update',
        { model: 'RoadmapItem', id: before._id },
        { before, after: item.toObject() }
      );
      res.json(item);
    } catch (err) {
      next(err);
    }
  }
);

router.delete('/:id/items/:itemId', requirePermission('training:write'), async (req, res, next) => {
  try {
    const tenantId = req.tenant._id;
    const roadmap = await findRoadmap(tenantId, req.params.id);
    const item = await RoadmapItem.findOneAndDelete({
      _id: req.params.itemId,
      tenantId,
      roadmapId: roadmap._id,
    });
    if (!item) throw new AppError('Not found', 404);

    // Anything that waited on this item would otherwise stay locked for good.
    await Promise.all([
      RoadmapItem.updateMany(
        { tenantId, roadmapId: roadmap._id, unlockAfter: item._id },
        { $pull: { unlockAfter: item._id } }
      ),
      RoadmapProgress.deleteMany({ tenantId, itemId: item._id }),
    ]);
    await audit(req, 'training.roadmap.item.delete', { model: 'RoadmapItem', id: item._id });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

export default router;
