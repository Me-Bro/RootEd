import { Router } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import {
  checkInSchema,
  freeSeatsQuerySchema,
  monthQuerySchema,
  dateQuerySchema,
} from '@rooted/shared/schemas';
import { authenticate } from '../middleware/authenticate.js';
import { requirePermission, userHasPermission } from '../middleware/requirePermission.js';
import { requireSeatsOrg } from '../middleware/requireSeatsOrg.js';
import { validate } from '../middleware/validate.js';
import { checkIn, checkOut, freeSeats, listOpenVisits } from '../services/visit.service.js';
import { checkOutAll, loadDesk, loadDeskSummary } from '../services/desk.service.js';
import { DESK_FILTERS } from '../utils/deskView.js';
import { learnerVisits } from '../services/studentVisits.service.js';
import { Student } from '../models/Student.js';
import { auditLog } from '../services/audit.service.js';
import { currentOccupancy, monthlyHours, noShowsOn } from '../services/studyReports.service.js';

// Check-in and check-out at a study center's front desk. Mounted under /academic
// after the academic router, behind requireSeatsOrg.
const router = Router();

router.use(authenticate);
router.use(requireSeatsOrg);

const audit = (req, action, visit, extra = {}) =>
  auditLog({
    actorId: req.user.sub,
    tenantId: req.tenant._id.toString(),
    action,
    target: { model: 'Visit', id: visit._id },
    after: visit.toObject ? visit.toObject() : visit,
    ip: req.ip,
    ...extra,
  });

// The front desk in one read: the strip, the learner list, live seat tiles, today's
// activity. A learner's plan status is included only for someone who may read fees.
const deskQuery = z.object({
  search: z.string().trim().max(60).optional(),
  filter: z.enum(DESK_FILTERS).default('all'),
});

router.get('/visits/desk', requirePermission('attendance:read'), async (req, res, next) => {
  try {
    const query = deskQuery.safeParse(req.query);
    if (!query.success) return res.status(400).json({ error: query.error.issues[0].message });
    const withFees = await userHasPermission(req, 'fees:read');
    res.json(await loadDesk({ tenant: req.tenant, withFees, ...query.data }));
  } catch (err) {
    next(err);
  }
});

// The desk's strip alone, for the dashboard.
router.get('/visits/desk/summary', requirePermission('attendance:read'), async (req, res, next) => {
  try {
    res.json(await loadDeskSummary({ tenant: req.tenant }));
  } catch (err) {
    next(err);
  }
});

router.get('/visits/open', requirePermission('attendance:read'), async (req, res, next) => {
  try {
    res.json(await listOpenVisits(req.tenant._id));
  } catch (err) {
    next(err);
  }
});

// ── Owner reports (read-only; formulas are in utils/visitReports.js) ──────────

router.get(
  '/visits/reports/hours',
  requirePermission('attendance:read'),
  async (req, res, next) => {
    try {
      const { month } = monthQuerySchema.parse(req.query);
      res.json(await monthlyHours(req.tenant, month));
    } catch (err) {
      next(err);
    }
  }
);

router.get(
  '/visits/reports/occupancy',
  requirePermission('attendance:read'),
  async (req, res, next) => {
    try {
      res.json(await currentOccupancy(req.tenant._id));
    } catch (err) {
      next(err);
    }
  }
);

router.get(
  '/visits/reports/no-shows',
  requirePermission('attendance:read'),
  async (req, res, next) => {
    try {
      const { date } = dateQuerySchema.parse(req.query);
      res.json(await noShowsOn(req.tenant, date));
    } catch (err) {
      next(err);
    }
  }
);

// One learner's visits for their profile: the open visit, this month's totals and a
// page of past visits (what the front desk needs to settle "were they here?").
const learnerVisitsQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  month: monthQuerySchema.shape.month.optional(),
});

router.get('/students/:id/visits', requirePermission('attendance:read'), async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(404).json({ error: 'Not found' });
    }
    const query = learnerVisitsQuery.safeParse(req.query);
    if (!query.success) return res.status(400).json({ error: query.error.issues[0].message });

    const tenantId = req.tenant._id;
    const student = await Student.findOne({ _id: req.params.id, tenantId }, '_id').lean();
    if (!student) return res.status(404).json({ error: 'Not found' });

    res.json(await learnerVisits({ tenant: req.tenant, studentId: student._id, ...query.data }));
  } catch (err) {
    next(err);
  }
});

router.get('/visits/free-seats', requirePermission('attendance:read'), async (req, res, next) => {
  try {
    const { studentId } = freeSeatsQuerySchema.parse(req.query);
    res.json(await freeSeats(req.tenant._id, studentId));
  } catch (err) {
    next(err);
  }
});

router.post(
  '/visits/check-in',
  requirePermission('attendance:write'),
  validate(checkInSchema),
  async (req, res, next) => {
    try {
      const isOwner = await userHasPermission(req, 'tenant:admin');
      const result = await checkIn({
        tenant: req.tenant,
        studentId: req.body.studentId,
        seatId: req.body.seatId,
        recordedBy: req.user.sub,
        isOwner,
      });
      await audit(req, 'visit.checkIn', result.visit);
      // An owner letting someone in after hours is the exception the owner must own.
      if (result.visit.outsideHours) await audit(req, 'visit.outsideHours', result.visit);
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  }
);

// End of day: an owner closes everyone still inside. Each closed visit is audited.
router.post(
  '/visits/check-out-all',
  requirePermission('attendance:write'),
  async (req, res, next) => {
    try {
      if (!(await userHasPermission(req, 'tenant:admin'))) {
        return res.status(403).json({ error: 'Only an owner can check everyone out' });
      }
      const closed = await checkOutAll({ tenantId: req.tenant._id });
      for (const visit of closed) await audit(req, 'visit.checkOut', visit);
      res.json({ closed: closed.length });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/visits/:id/check-out',
  requirePermission('attendance:write'),
  async (req, res, next) => {
    try {
      const visit = await checkOut({ tenantId: req.tenant._id, visitId: req.params.id });
      await audit(req, 'visit.checkOut', visit);
      res.json(visit);
    } catch (err) {
      next(err);
    }
  }
);

export default router;
