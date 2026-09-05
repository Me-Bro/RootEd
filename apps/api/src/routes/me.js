import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/authenticate.js';
import { requirePermission, resolveContext } from '../middleware/requirePermission.js';
import { requireModuleEnabled } from '../middleware/requireModuleEnabled.js';
import { AppError } from '../middleware/errorHandler.js';
import { AttendanceRecord } from '../models/AttendanceRecord.js';
import { Grade } from '../models/Grade.js';
import { GradeLock } from '../models/GradeLock.js';
import { Timetable } from '../models/Timetable.js';
import { TimetablePublish } from '../models/TimetablePublish.js';
import { FeeAssignment } from '../models/FeeAssignment.js';
import { FeePayment } from '../models/FeePayment.js';
import { Student } from '../models/Student.js';
import { Subject } from '../models/Subject.js';
import { filterVisibleTimetableEntries } from '../utils/timetableVisibility.js';

/**
 * Everything a person may see about *themselves*.
 *
 * These routes exist because requirePermission() is a flat allow/deny with no
 * row-level notion: every tenant-wide handler builds its filter as
 * `if (query.studentId) filter.studentId = ...`, so omitting the parameter
 * returns the whole school. Rather than teaching ~44 handlers to narrow — where
 * the one that gets missed fails open and silently — a self-scoped role holds
 * no tenant-wide permission at all and can only reach this router, which never
 * accepts an identity from the caller.
 */
const router = Router();

router.use(authenticate);

/** Resolves who the caller is in this tenant. Never trusts a request parameter. */
async function attachSubjects(req, _res, next) {
  try {
    if (!req.tenant) throw new AppError('Tenant context missing', 400);
    const { subjects } = await resolveContext(req.user.sub, req.tenant._id.toString());
    req.subjects = subjects;
    next();
  } catch (err) {
    next(err);
  }
}
router.use(attachSubjects);

function studentIdOf(req) {
  const id = req.subjects?.studentId;
  if (!id) throw new AppError('No student record is linked to this account', 404);
  return id;
}

const rangeSchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

router.get('/profile', async (req, res, next) => {
  try {
    const student = req.subjects?.studentId
      ? await Student.findOne(
          { _id: req.subjects.studentId, tenantId: req.tenant._id },
          'firstName lastName admissionNo sectionId status'
        ).lean()
      : null;

    res.json({
      isStudent: Boolean(req.subjects?.studentId),
      isStaff: Boolean(req.subjects?.staffId),
      student,
    });
  } catch (err) {
    next(err);
  }
});

router.get(
  '/attendance',
  requireModuleEnabled('academic'),
  requirePermission('self:attendance:read'),
  async (req, res, next) => {
    try {
      const { from, to } = rangeSchema.parse(req.query);
      const filter = {
        tenantId: req.tenant._id,
        entityType: 'student',
        entityId: studentIdOf(req),
      };
      if (from || to) {
        filter.date = {};
        if (from) filter.date.$gte = from;
        if (to) filter.date.$lte = to;
      }

      res.json(await AttendanceRecord.find(filter).sort({ date: -1 }).limit(400).lean());
    } catch (err) {
      next(err);
    }
  }
);

router.get(
  '/grades',
  requireModuleEnabled('academic'),
  requirePermission('self:grades:read'),
  async (req, res, next) => {
    try {
      const tenantId = req.tenant._id;
      // Deliberately not populated: populate() replaces subjectId with the
      // Subject document, and yields null when the reference no longer
      // resolves — which would silently drop a published grade from the
      // student's view. The visibility decision is made on raw ids, and names
      // are attached afterwards.
      const grades = await Grade.find({ tenantId, studentId: studentIdOf(req) }).lean();
      if (!grades.length) return res.json([]);

      // A GradeLock is the publish record — it carries publishedAt/publishedBy.
      // Marks a teacher is still entering must not be visible to the student
      // they are about.
      const locks = await GradeLock.find(
        { tenantId },
        'sectionId subjectId termId assessmentType'
      ).lean();
      const published = new Set(
        locks.map((l) => `${l.sectionId}:${l.subjectId}:${l.termId}:${l.assessmentType}`)
      );

      const visible = grades.filter((g) =>
        published.has(`${g.sectionId}:${g.subjectId}:${g.termId}:${g.assessmentType}`)
      );
      if (!visible.length) return res.json([]);

      const subjects = await Subject.find(
        { tenantId, _id: { $in: [...new Set(visible.map((g) => String(g.subjectId)))] } },
        'name code'
      ).lean();
      const byId = new Map(subjects.map((s) => [String(s._id), s]));

      res.json(visible.map((g) => ({ ...g, subject: byId.get(String(g.subjectId)) ?? null })));
    } catch (err) {
      next(err);
    }
  }
);

router.get(
  '/timetable',
  requireModuleEnabled('academic'),
  requirePermission('self:timetable:read'),
  async (req, res, next) => {
    try {
      const tenantId = req.tenant._id;
      studentIdOf(req);
      const sectionId = req.subjects?.sectionId;
      if (!sectionId) return res.json([]);

      const [entries, publishes] = await Promise.all([
        Timetable.find({ tenantId, sectionId })
          .populate('subjectId', 'name code')
          .sort({ dayOfWeek: 1, periodNumber: 1 })
          .lean(),
        TimetablePublish.find({ tenantId }).lean(),
      ]);

      const publishedKeys = new Set(publishes.map((p) => `${p.academicYearId}:${p.sectionId}`));
      // isAdmin false, always: an unpublished timetable is a draft.
      res.json(filterVisibleTimetableEntries(entries, publishedKeys, false));
    } catch (err) {
      next(err);
    }
  }
);

router.get(
  '/fees',
  requireModuleEnabled('fee'),
  requirePermission('self:fees:read'),
  async (req, res, next) => {
    try {
      const tenantId = req.tenant._id;
      const studentId = studentIdOf(req);

      const [assignments, payments] = await Promise.all([
        FeeAssignment.find({ tenantId, studentId }).sort({ dueDate: 1 }).lean(),
        // Deliberately not joining FeeDiscount: its `reason` is an internal
        // note about the family, written for staff and not for the student.
        FeePayment.find({ tenantId, studentId }, '-notes').sort({ paymentDate: -1 }).lean(),
      ]);

      res.json({ assignments, payments });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
