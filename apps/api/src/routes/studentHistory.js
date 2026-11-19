import { Router } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import { authenticate } from '../middleware/authenticate.js';
import { requirePermission, userHasPermission } from '../middleware/requirePermission.js';
import { requireSeatsOrg } from '../middleware/requireSeatsOrg.js';
import { AuditLog } from '../models/AuditLog.js';
import { Student } from '../models/Student.js';
import { User } from '../models/User.js';
import { Seat } from '../models/Seat.js';
import { Section } from '../models/Section.js';
import {
  HISTORY_TYPES,
  actionFilterFor,
  buildHistoryEntry,
  referencedIds,
} from '../utils/studentHistory.js';

// A study-center learner's History tab: the audit trail of everything done to or for
// them, newest first. Mounted under /academic. Reads AuditLog but never returns its
// raw before/after (see utils/studentHistory.js), so what a front desk sees here is
// no more than they can already read on the profile.
const router = Router();

router.use(authenticate);

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  type: z.enum(HISTORY_TYPES).optional(),
});

const displayName = (u) =>
  [u.firstName, u.lastName].filter(Boolean).join(' ') || u.username || null;

router.get(
  '/students/:id/history',
  requireSeatsOrg,
  requirePermission('students:read'),
  async (req, res, next) => {
    try {
      if (!mongoose.isValidObjectId(req.params.id)) {
        return res.status(404).json({ error: 'Not found' });
      }
      const query = querySchema.safeParse(req.query);
      if (!query.success) return res.status(400).json({ error: query.error.issues[0].message });
      const { page, limit, type } = query.data;

      const tenantId = req.tenant._id;
      const student = await Student.findOne({ _id: req.params.id, tenantId }, '_id').lean();
      if (!student) return res.status(404).json({ error: 'Not found' });

      // AuditLog is not tenant-scoped by the plugin, so the tenant is part of every filter.
      const filter = { tenantId, studentId: student._id, ...(type ? actionFilterFor(type) : {}) };
      const [logs, total] = await Promise.all([
        AuditLog.find(filter)
          .sort({ at: -1, _id: -1 })
          .skip((page - 1) * limit)
          .limit(limit)
          .lean(),
        AuditLog.countDocuments(filter),
      ]);

      const { seatIds, sectionIds } = referencedIds(logs);
      const actorIds = [...new Set(logs.map((l) => String(l.actorId)))];
      const [users, seats, sections, includeIp] = await Promise.all([
        User.find({ _id: { $in: actorIds } }, 'firstName lastName username').lean(),
        Seat.find({ tenantId, _id: { $in: seatIds } }, 'label').lean(),
        Section.find({ tenantId, _id: { $in: sectionIds } }, 'name').lean(),
        userHasPermission(req, 'tenant:admin'),
      ]);
      const lookups = {
        actors: new Map(users.map((u) => [String(u._id), displayName(u)])),
        seats: new Map(seats.map((s) => [String(s._id), s.label])),
        sections: new Map(sections.map((s) => [String(s._id), s.name])),
      };

      res.json({
        entries: logs.map((l) => buildHistoryEntry(l, lookups, { includeIp })),
        total,
        page,
        pages: Math.ceil(total / limit),
      });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
