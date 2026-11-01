import { Router } from 'express';
import {
  seatSchema,
  updateSeatSchema,
  bulkSeatSchema,
  seatAllocationSchema,
  moveAllocationSchema,
  availabilityQuerySchema,
  allocationQuerySchema,
} from '@rooted/shared/schemas';
import { authenticate } from '../middleware/authenticate.js';
import { requirePermission } from '../middleware/requirePermission.js';
import { requireSeatsOrg } from '../middleware/requireSeatsOrg.js';
import { validate } from '../middleware/validate.js';
import { Seat } from '../models/Seat.js';
import { SeatAllocation } from '../models/SeatAllocation.js';
import { bySeatLabel } from '../utils/seatAvailability.js';
import {
  createSeats,
  loadAvailability,
  assignSeat,
  endAllocation,
  moveAllocation,
  assertSeatCanBeDeactivated,
} from '../services/seat.service.js';
import { auditLog } from '../services/audit.service.js';

// Seats and the standing holds members have on them, for study centers. Mounted
// under /academic after the academic router, behind requireSeatsOrg.
const router = Router();

router.use(authenticate);
router.use(requireSeatsOrg);

const audit = (req, action, target, extra = {}) =>
  auditLog({
    actorId: req.user.sub,
    tenantId: req.tenant._id.toString(),
    action,
    target,
    ip: req.ip,
    ...extra,
  });

router.get('/seats', requirePermission('students:read'), async (req, res, next) => {
  try {
    const filter = { tenantId: req.tenant._id };
    if (req.query.zone) filter.zone = req.query.zone;
    if (req.query.active === 'true') filter.isActive = true;
    if (req.query.active === 'false') filter.isActive = false;
    const seats = await Seat.find(filter).lean();
    res.json(seats.sort(bySeatLabel));
  } catch (err) {
    next(err);
  }
});

// One seat, or a run of them ({ prefix, count }). A label that already exists is
// skipped and counted, so adding "A-1..A-6" twice is harmless.
router.post('/seats', requirePermission('students:write'), async (req, res, next) => {
  try {
    const tenantId = req.tenant._id;
    if ('count' in req.body) {
      const input = bulkSeatSchema.parse(req.body);
      const result = await createSeats(tenantId, input);
      await audit(req, 'seat.createMany', { model: 'Seat' }, { after: { ...input, ...result } });
      return res.status(201).json(result);
    }
    const input = seatSchema.parse(req.body);
    const seat = await Seat.create({ tenantId, ...input });
    await audit(req, 'seat.create', { model: 'Seat', id: seat._id }, { after: seat.toObject() });
    res.status(201).json(seat);
  } catch (err) {
    next(err);
  }
});

router.patch(
  '/seats/:id',
  requirePermission('students:write'),
  validate(updateSeatSchema),
  async (req, res, next) => {
    try {
      const tenantId = req.tenant._id;
      const before = await Seat.findOne({ _id: req.params.id, tenantId }).lean();
      if (!before) return res.status(404).json({ error: 'Not found' });
      if (req.body.isActive === false) await assertSeatCanBeDeactivated(tenantId, before._id);

      const update = { $set: {} };
      for (const [key, value] of Object.entries(req.body)) {
        if (key === 'zone' && value === '') update.$unset = { zone: '' };
        else update.$set[key] = value;
      }
      const seat = await Seat.findOneAndUpdate({ _id: before._id, tenantId }, update, {
        new: true,
      });
      await audit(
        req,
        'seat.update',
        { model: 'Seat', id: seat._id },
        { before, after: seat.toObject() }
      );
      res.json(seat);
    } catch (err) {
      next(err);
    }
  }
);

router.get('/seats/availability', requirePermission('students:read'), async (req, res, next) => {
  try {
    const { sectionId } = availabilityQuerySchema.parse(req.query);
    res.json(await loadAvailability(req.tenant._id, sectionId));
  } catch (err) {
    next(err);
  }
});

router.get('/seat-allocations', requirePermission('students:read'), async (req, res, next) => {
  try {
    const query = allocationQuerySchema.parse(req.query);
    const allocations = await SeatAllocation.find({
      tenantId: req.tenant._id,
      status: 'active',
      ...query,
    })
      .populate('seatId', 'label zone')
      .populate('sectionId', 'name startTime endTime')
      .lean();
    res.json(allocations);
  } catch (err) {
    next(err);
  }
});

router.post(
  '/seat-allocations',
  requirePermission('students:write'),
  validate(seatAllocationSchema),
  async (req, res, next) => {
    try {
      const allocation = await assignSeat(req.tenant._id, req.body);
      await audit(
        req,
        'seatAllocation.create',
        { model: 'SeatAllocation', id: allocation._id },
        { after: allocation.toObject() }
      );
      res.status(201).json(allocation);
    } catch (err) {
      next(err);
    }
  }
);

router.patch(
  '/seat-allocations/:id',
  requirePermission('students:write'),
  validate(moveAllocationSchema),
  async (req, res, next) => {
    try {
      const tenantId = req.tenant._id;
      const before = await SeatAllocation.findOne({ _id: req.params.id, tenantId }).lean();
      if (req.body.action === 'end') {
        const ended = await endAllocation(tenantId, req.params.id);
        await audit(
          req,
          'seatAllocation.end',
          { model: 'SeatAllocation', id: ended._id },
          { before, after: ended.toObject() }
        );
        return res.json(ended);
      }
      const moved = await moveAllocation(tenantId, req.params.id, req.body.seatId);
      await audit(
        req,
        'seatAllocation.move',
        { model: 'SeatAllocation', id: moved._id },
        { before, after: moved.toObject ? moved.toObject() : moved }
      );
      res.json(moved);
    } catch (err) {
      next(err);
    }
  }
);

export default router;
