import { Router } from 'express';
import { walkInSchema } from '@rooted/shared/schemas';
import { authenticate } from '../middleware/authenticate.js';
import { requirePermission } from '../middleware/requirePermission.js';
import { requireSeatsOrg } from '../middleware/requireSeatsOrg.js';
import { validate } from '../middleware/validate.js';
import { Student } from '../models/Student.js';
import { getNextSequence } from '../services/counter.service.js';
import { auditLog } from '../services/audit.service.js';
import { dayStringInTz } from '../utils/dayKey.js';

// Walk-in visitors of a study center: a Student with kind 'walk_in', a name and
// a phone, so a day pass is sold and attended through the same fee and
// attendance records as a member. Mounted under /academic.
const router = Router();

router.use(authenticate);
router.use(requireSeatsOrg);

const existingBody = (s) => ({
  _id: s._id,
  admissionNo: s.admissionNo,
  firstName: s.firstName,
  lastName: s.lastName,
  phone: s.phone,
  kind: s.kind,
});

router.post(
  '/walk-ins',
  requirePermission('students:write'),
  validate(walkInSchema),
  async (req, res, next) => {
    try {
      const tenantId = req.tenant._id;
      const { firstName, lastName, phone } = req.body;

      // A returning visitor is the same person: hand back their record rather than
      // minting a second one. Only walk-ins count — a member's phone may be a
      // parent's, shared with the visitor.
      const existing = await Student.findOne({ tenantId, phone, kind: 'walk_in' }).lean();
      if (existing) {
        return res.status(409).json({
          error: 'A walk-in with this phone already exists',
          existing: existingBody(existing),
        });
      }

      const day = dayStringInTz(new Date(), req.tenant.timezone).replaceAll('-', '');
      const seq = await getNextSequence(tenantId, `walkin:${day}`);

      let student;
      try {
        student = await Student.create({
          tenantId,
          admissionNo: `W-${day}-${String(seq).padStart(3, '0')}`,
          firstName,
          lastName,
          phone,
          kind: 'walk_in',
          status: 'active',
        });
      } catch (err) {
        // Two desks registering the same number at once: the partial unique index
        // on walk-in phones decides, and the loser gets the winner's record.
        if (err.code === 11000) {
          const winner = await Student.findOne({ tenantId, phone, kind: 'walk_in' }).lean();
          if (winner) {
            return res.status(409).json({
              error: 'A walk-in with this phone already exists',
              existing: existingBody(winner),
            });
          }
        }
        throw err;
      }

      await auditLog({
        actorId: req.user.sub,
        tenantId: tenantId.toString(),
        action: 'walkIn.create',
        target: { model: 'Student', id: student._id },
        after: student.toObject(),
        ip: req.ip,
      });

      res.status(201).json(student);
    } catch (err) {
      next(err);
    }
  }
);

// Erases what identifies a visitor. Names stay on fee receipts as "Walk-in
// Erased", so the receipt and audit trail keep their reference.
router.post(
  '/walk-ins/:id/erase-contact',
  requirePermission('tenant:admin'),
  async (req, res, next) => {
    try {
      const tenantId = req.tenant._id;
      const before = await Student.findOne({
        _id: req.params.id,
        tenantId,
        kind: 'walk_in',
      }).lean();
      if (!before) return res.status(404).json({ error: 'Not found' });

      const student = await Student.findOneAndUpdate(
        { _id: before._id, tenantId },
        { $set: { firstName: 'Walk-in', lastName: 'Erased' }, $unset: { phone: '' } },
        { new: true }
      );

      await auditLog({
        actorId: req.user.sub,
        tenantId: tenantId.toString(),
        action: 'walkIn.eraseContact',
        target: { model: 'Student', id: student._id },
        before,
        after: student.toObject(),
        ip: req.ip,
      });

      res.json(student);
    } catch (err) {
      next(err);
    }
  }
);

export default router;
