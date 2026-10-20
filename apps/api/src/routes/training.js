import { Router } from 'express';
import mongoose from 'mongoose';
import {
  trainingListQuerySchema,
  createAssignmentSchema,
  updateAssignmentSchema,
  upsertSubmissionSchema,
  createProjectSchema,
  updateProjectSchema,
} from '@rooted/shared/schemas';
import { authenticate } from '../middleware/authenticate.js';
import { requirePermission } from '../middleware/requirePermission.js';
import { validate } from '../middleware/validate.js';
import { AppError } from '../middleware/errorHandler.js';
import { Assignment } from '../models/Assignment.js';
import { Submission } from '../models/Submission.js';
import { Project } from '../models/Project.js';
import { auditLog } from '../services/audit.service.js';
import { assertRefs, assertOnRoster, getBatchRoster } from '../services/training.service.js';
import { buildSubmissionUpdate } from '../utils/trainingSubmission.js';

/**
 * Training module: batch assignments, per-student results and team projects.
 * Every tenant-wide route here is gated on training:read / training:write; a
 * student reaches their own results only through /me.
 */
const router = Router();

router.use(authenticate);

// A malformed id is a 404, not a CastError turned into a 500.
for (const param of ['id', 'studentId']) {
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

// ── Assignments ───────────────────────────────────────────────────────────────

router.get('/assignments', requirePermission('training:read'), async (req, res, next) => {
  try {
    const tenantId = req.tenant._id;
    const query = trainingListQuerySchema.parse(req.query);
    const filter = { tenantId, ...query };

    const assignments = await Assignment.find(filter).sort({ dueDate: 1 }).limit(500).lean();

    const grouped = await Submission.aggregate([
      { $match: { tenantId, assignmentId: { $in: assignments.map((a) => a._id) } } },
      { $group: { _id: { assignmentId: '$assignmentId', status: '$status' }, n: { $sum: 1 } } },
    ]);
    const counts = new Map();
    for (const { _id, n } of grouped) {
      const key = String(_id.assignmentId);
      counts.set(key, { ...(counts.get(key) ?? {}), [_id.status]: n });
    }

    res.json(
      assignments.map((a) => ({
        ...a,
        counts: { pending: 0, submitted: 0, reviewed: 0, ...counts.get(String(a._id)) },
      }))
    );
  } catch (err) {
    next(err);
  }
});

router.post(
  '/assignments',
  requirePermission('training:write'),
  validate(createAssignmentSchema),
  async (req, res, next) => {
    try {
      const tenantId = req.tenant._id;
      await assertRefs(tenantId, req.body);

      const assignment = await Assignment.create({
        ...req.body,
        tenantId,
        createdBy: req.user.sub,
      });
      await audit(req, 'training.assignment.create', {
        model: 'Assignment',
        id: assignment._id,
      });
      res.status(201).json(assignment);
    } catch (err) {
      next(err);
    }
  }
);

router.patch(
  '/assignments/:id',
  requirePermission('training:write'),
  validate(updateAssignmentSchema),
  async (req, res, next) => {
    try {
      const tenantId = req.tenant._id;
      const { id } = req.params;

      // Lowering the maximum below a score already given would leave a result
      // that no longer fits its own assignment.
      if (
        req.body.maxScore !== undefined &&
        (await Submission.exists({
          tenantId,
          assignmentId: id,
          score: { $gt: req.body.maxScore },
        }))
      ) {
        throw new AppError('A recorded score is higher than the new maximum', 409);
      }

      const before = await Assignment.findOne({ _id: id, tenantId }).lean();
      if (!before) throw new AppError('Not found', 404);
      const assignment = await Assignment.findOneAndUpdate(
        { _id: id, tenantId },
        { $set: req.body },
        { new: true, runValidators: true }
      );

      await audit(
        req,
        'training.assignment.update',
        { model: 'Assignment', id },
        {
          before,
          after: assignment.toObject(),
        }
      );
      res.json(assignment);
    } catch (err) {
      next(err);
    }
  }
);

router.delete('/assignments/:id', requirePermission('training:write'), async (req, res, next) => {
  try {
    const tenantId = req.tenant._id;
    const assignment = await Assignment.findOneAndDelete({ _id: req.params.id, tenantId });
    if (!assignment) throw new AppError('Not found', 404);
    await Submission.deleteMany({ tenantId, assignmentId: assignment._id });

    await audit(req, 'training.assignment.delete', { model: 'Assignment', id: assignment._id });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// ── Submissions ───────────────────────────────────────────────────────────────

router.get(
  '/assignments/:id/submissions',
  requirePermission('training:read'),
  async (req, res, next) => {
    try {
      const tenantId = req.tenant._id;
      const assignment = await Assignment.findOne({ _id: req.params.id, tenantId }).lean();
      if (!assignment) throw new AppError('Not found', 404);

      const [roster, submissions] = await Promise.all([
        getBatchRoster(tenantId, assignment.sectionId),
        Submission.find({ tenantId, assignmentId: assignment._id }).lean(),
      ]);
      const byStudent = new Map(submissions.map((s) => [String(s.studentId), s]));

      res.json(
        roster.map((student) => ({
          student,
          submission: byStudent.get(String(student._id)) ?? null,
        }))
      );
    } catch (err) {
      next(err);
    }
  }
);

router.put(
  '/assignments/:id/submissions/:studentId',
  requirePermission('training:write'),
  validate(upsertSubmissionSchema),
  async (req, res, next) => {
    try {
      const tenantId = req.tenant._id;
      const { id, studentId } = req.params;

      const assignment = await Assignment.findOne({ _id: id, tenantId }).lean();
      if (!assignment) throw new AppError('Not found', 404);
      await assertOnRoster(tenantId, assignment.sectionId, [studentId]);

      const existing = await Submission.findOne({
        tenantId,
        assignmentId: id,
        studentId,
      }).lean();
      const update = buildSubmissionUpdate({
        assignment,
        existing,
        input: req.body,
        actorId: req.user.sub,
      });

      const submission = await Submission.findOneAndUpdate(
        { tenantId, assignmentId: id, studentId },
        { $set: update },
        { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
      );

      await audit(
        req,
        'training.submission.upsert',
        { model: 'Submission', id: submission._id },
        {
          before: existing ?? undefined,
          after: submission.toObject(),
        }
      );
      res.json(submission);
    } catch (err) {
      next(err);
    }
  }
);

// ── Projects ──────────────────────────────────────────────────────────────────

router.get('/projects', requirePermission('training:read'), async (req, res, next) => {
  try {
    const { sectionId, termId } = trainingListQuerySchema.parse(req.query);
    const filter = { tenantId: req.tenant._id };
    if (sectionId) filter.sectionId = sectionId;
    if (termId) filter.termId = termId;

    res.json(await Project.find(filter).sort({ createdAt: -1 }).limit(200).lean());
  } catch (err) {
    next(err);
  }
});

router.post(
  '/projects',
  requirePermission('training:write'),
  validate(createProjectSchema),
  async (req, res, next) => {
    try {
      const tenantId = req.tenant._id;
      await assertRefs(tenantId, req.body);
      await assertOnRoster(tenantId, req.body.sectionId, req.body.memberIds);

      const project = await Project.create({ ...req.body, tenantId, createdBy: req.user.sub });
      await audit(req, 'training.project.create', { model: 'Project', id: project._id });
      res.status(201).json(project);
    } catch (err) {
      next(err);
    }
  }
);

router.patch(
  '/projects/:id',
  requirePermission('training:write'),
  validate(updateProjectSchema),
  async (req, res, next) => {
    try {
      const tenantId = req.tenant._id;
      const before = await Project.findOne({ _id: req.params.id, tenantId }).lean();
      if (!before) throw new AppError('Not found', 404);

      if (req.body.memberIds) {
        await assertOnRoster(tenantId, before.sectionId, req.body.memberIds);
      }

      const update = { ...req.body };
      // Whoever sets the review is the reviewer.
      if (req.body.reviewScore !== undefined || req.body.reviewNotes !== undefined) {
        update.reviewedBy = req.user.sub;
      }

      const project = await Project.findOneAndUpdate(
        { _id: before._id, tenantId },
        { $set: update },
        { new: true, runValidators: true }
      );

      await audit(
        req,
        'training.project.update',
        { model: 'Project', id: project._id },
        {
          before,
          after: project.toObject(),
        }
      );
      res.json(project);
    } catch (err) {
      next(err);
    }
  }
);

export default router;
