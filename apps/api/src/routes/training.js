import { Router } from 'express';
import mongoose from 'mongoose';
import {
  trainingListQuerySchema,
  createAssignmentSchema,
  updateAssignmentSchema,
  upsertSubmissionSchema,
  createProjectSchema,
  updateProjectSchema,
  createEmployerSchema,
  updateEmployerSchema,
  createPlacementSchema,
  movePlacementSchema,
  placementQuerySchema,
  consentSchema,
  completionSchema,
  batchQuerySchema,
  batchTermQuerySchema,
} from '@rooted/shared/schemas';
import { authenticate } from '../middleware/authenticate.js';
import { requirePermission } from '../middleware/requirePermission.js';
import { validate } from '../middleware/validate.js';
import { AppError } from '../middleware/errorHandler.js';
import { Assignment } from '../models/Assignment.js';
import { Submission } from '../models/Submission.js';
import { Project } from '../models/Project.js';
import { Employer } from '../models/Employer.js';
import { PlacementApplication } from '../models/PlacementApplication.js';
import { Student } from '../models/Student.js';
import { Enrollment } from '../models/Enrollment.js';
import { auditLog } from '../services/audit.service.js';
import {
  assertRefs,
  assertOnRoster,
  getBatchRoster,
  getBatchEnrollments,
} from '../services/training.service.js';
import { buildSubmissionUpdate } from '../utils/trainingSubmission.js';
import { getBatchMetrics } from '../services/trainingMetrics.service.js';
import { buildReportContent, renderReportPdf } from '../services/trainingReport.service.js';
import { Section } from '../models/Section.js';
import { buildStageMove } from '../utils/placementStage.js';
import { applyCompletion } from '../utils/enrollmentCompletion.js';

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

// ── Employers ─────────────────────────────────────────────────────────────────

const conflictAs409 = (err, message) => (err?.code === 11000 ? new AppError(message, 409) : err);

router.get('/employers', requirePermission('training:read'), async (req, res, next) => {
  try {
    res.json(await Employer.find({ tenantId: req.tenant._id }).sort({ name: 1 }).limit(500).lean());
  } catch (err) {
    next(err);
  }
});

router.post(
  '/employers',
  requirePermission('training:write'),
  validate(createEmployerSchema),
  async (req, res, next) => {
    try {
      const employer = await Employer.create({ ...req.body, tenantId: req.tenant._id });
      await audit(req, 'training.employer.create', { model: 'Employer', id: employer._id });
      res.status(201).json(employer);
    } catch (err) {
      next(conflictAs409(err, 'An employer with this name already exists'));
    }
  }
);

router.patch(
  '/employers/:id',
  requirePermission('training:write'),
  validate(updateEmployerSchema),
  async (req, res, next) => {
    try {
      const employer = await Employer.findOneAndUpdate(
        { _id: req.params.id, tenantId: req.tenant._id },
        { $set: req.body },
        { new: true, runValidators: true }
      );
      if (!employer) throw new AppError('Not found', 404);
      await audit(req, 'training.employer.update', { model: 'Employer', id: employer._id });
      res.json(employer);
    } catch (err) {
      next(conflictAs409(err, 'An employer with this name already exists'));
    }
  }
);

// ── Placements ────────────────────────────────────────────────────────────────

router.get('/placements', requirePermission('training:read'), async (req, res, next) => {
  try {
    const tenantId = req.tenant._id;
    const { sectionId, stage } = placementQuerySchema.parse(req.query);
    const filter = { tenantId };
    if (stage) filter.stage = stage;
    if (sectionId) {
      const batch = await getBatchEnrollments(tenantId, sectionId);
      filter.studentId = { $in: batch.map((b) => b.student._id) };
    }

    const applications = await PlacementApplication.find(filter)
      .sort({ updatedAt: -1 })
      .limit(1000)
      .lean();

    const [students, employers] = await Promise.all([
      Student.find(
        { tenantId, _id: { $in: applications.map((a) => a.studentId) } },
        'firstName lastName admissionNo'
      ).lean(),
      Employer.find(
        { tenantId, _id: { $in: applications.map((a) => a.employerId) } },
        'name'
      ).lean(),
    ]);
    const studentById = new Map(students.map((s) => [String(s._id), s]));
    const employerById = new Map(employers.map((e) => [String(e._id), e]));

    res.json(
      applications.map((a) => ({
        ...a,
        student: studentById.get(String(a.studentId)) ?? null,
        employer: employerById.get(String(a.employerId)) ?? null,
      }))
    );
  } catch (err) {
    next(err);
  }
});

router.post(
  '/placements',
  requirePermission('training:write'),
  validate(createPlacementSchema),
  async (req, res, next) => {
    try {
      const tenantId = req.tenant._id;
      const { studentId, employerId } = req.body;
      const [student, employer] = await Promise.all([
        Student.exists({ _id: studentId, tenantId }),
        Employer.exists({ _id: employerId, tenantId }),
      ]);
      if (!student) throw new AppError('Student not found', 404);
      if (!employer) throw new AppError('Employer not found', 404);

      const application = await PlacementApplication.create({
        ...req.body,
        tenantId,
        createdBy: req.user.sub,
      });
      await audit(req, 'training.placement.create', {
        model: 'PlacementApplication',
        id: application._id,
      });
      res.status(201).json(application);
    } catch (err) {
      next(conflictAs409(err, 'This student already has an application for that role'));
    }
  }
);

router.patch(
  '/placements/:id',
  requirePermission('training:write'),
  validate(movePlacementSchema),
  async (req, res, next) => {
    try {
      const tenantId = req.tenant._id;
      const before = await PlacementApplication.findOne({ _id: req.params.id, tenantId }).lean();
      if (!before) throw new AppError('Not found', 404);

      const update = buildStageMove(before, req.body.stage, req.body.at);
      if (req.body.notes !== undefined) update.notes = req.body.notes;

      // Only if it is still at the stage the move was worked out from: two people
      // moving the same application at once must not silently overwrite each other.
      const application = await PlacementApplication.findOneAndUpdate(
        { _id: before._id, tenantId, stage: before.stage },
        { $set: update },
        { new: true, runValidators: true }
      );
      if (!application) {
        throw new AppError(
          'This application was just changed by someone else. Reload and try again.',
          409
        );
      }
      await audit(
        req,
        'training.placement.move',
        { model: 'PlacementApplication', id: application._id },
        { before: { stage: before.stage }, after: { stage: application.stage } }
      );
      res.json(application);
    } catch (err) {
      next(err);
    }
  }
);

router.put(
  '/students/:id/consent',
  requirePermission('training:write'),
  validate(consentSchema),
  async (req, res, next) => {
    try {
      const student = await Student.findOneAndUpdate(
        { _id: req.params.id, tenantId: req.tenant._id },
        {
          $set: {
            placementConsent: {
              granted: req.body.granted,
              at: new Date(),
              recordedBy: req.user.sub,
            },
          },
        },
        { new: true, projection: 'placementConsent' }
      );
      if (!student) throw new AppError('Not found', 404);

      await audit(
        req,
        'training.consent.set',
        { model: 'Student', id: student._id },
        { after: { granted: req.body.granted } }
      );
      res.json({ _id: student._id, placementConsent: student.placementConsent });
    } catch (err) {
      next(err);
    }
  }
);

// ── Batch roster and completion ───────────────────────────────────────────────

router.get('/enrollments', requirePermission('training:read'), async (req, res, next) => {
  try {
    const { sectionId } = batchQuerySchema.parse(req.query);
    await assertRefs(req.tenant._id, { sectionId });
    res.json(await getBatchEnrollments(req.tenant._id, sectionId));
  } catch (err) {
    next(err);
  }
});

// The admin's completion decision. It lives on Enrollment (the existing record
// of a student's membership of a batch) rather than a second table, and is
// keyed by student + batch because a college student may not have an Enrollment
// row yet — this creates it.
router.put(
  '/completion',
  requirePermission('training:complete'),
  validate(completionSchema),
  async (req, res, next) => {
    try {
      const tenantId = req.tenant._id;
      const { studentId, sectionId, status, notes } = req.body;
      await assertRefs(tenantId, { sectionId });

      const batch = await getBatchEnrollments(tenantId, sectionId);
      const entry = batch.find((b) => String(b.student._id) === studentId);
      if (!entry) throw new AppError('Student is not on this batch', 404);

      const update = applyCompletion(entry.enrollment, status, notes);
      const enrollment = await Enrollment.findOneAndUpdate(
        { tenantId, studentId, sectionId },
        { $set: update, $setOnInsert: { enrolledBy: req.user.sub } },
        { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
      );

      await audit(
        req,
        'training.completion.set',
        { model: 'Enrollment', id: enrollment._id },
        { before: entry.enrollment ?? undefined, after: enrollment.toObject() }
      );
      res.json(enrollment);
    } catch (err) {
      next(err);
    }
  }
);

// ── Metrics, readiness and the completion report ─────────────────────────────

router.get('/metrics', requirePermission('training:read'), async (req, res, next) => {
  try {
    const query = batchTermQuerySchema.parse(req.query);
    const { term, metrics } = await getBatchMetrics(req.tenant._id, query);
    res.json({ ...query, term, metrics });
  } catch (err) {
    next(err);
  }
});

router.get('/readiness', requirePermission('training:read'), async (req, res, next) => {
  try {
    const query = batchTermQuerySchema.parse(req.query);
    const { term, rows } = await getBatchMetrics(req.tenant._id, query);
    res.json({ ...query, term, rows });
  } catch (err) {
    next(err);
  }
});

router.get('/report.pdf', requirePermission('training:read'), async (req, res, next) => {
  try {
    const tenantId = req.tenant._id;
    const query = batchTermQuerySchema.parse(req.query);
    const [{ term, metrics }, section] = await Promise.all([
      getBatchMetrics(tenantId, query),
      Section.findOne({ _id: query.sectionId, tenantId }).populate('classId', 'name').lean(),
    ]);

    const batchName = [section.classId?.name, section.name].filter(Boolean).join(' — ');
    const content = buildReportContent({
      tenantName: req.tenant.name,
      batchName,
      term,
      metrics,
      generatedAt: new Date(),
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="completion-report-${query.sectionId}.pdf"`
    );
    renderReportPdf(res, content);
  } catch (err) {
    next(err);
  }
});

export default router;
