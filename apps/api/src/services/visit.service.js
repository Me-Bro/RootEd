import { Visit } from '../models/Visit.js';
import { Seat } from '../models/Seat.js';
import { SeatAllocation } from '../models/SeatAllocation.js';
import { Student } from '../models/Student.js';
import { Tenant } from '../models/Tenant.js';
import { AttendanceRecord } from '../models/AttendanceRecord.js';
import { AppError } from '../middleware/errorHandler.js';
import { entitlementFor } from './entitlement.service.js';
import { resolveCentreSettings } from '../utils/centreSettings.js';
import { dayKeyInTz } from '../utils/dayKey.js';
import { isWithinOpenHours } from '../utils/openHours.js';
import { freeSeatsFor } from '../utils/seatPool.js';
import { selectVisitsToClose } from '../utils/visitClose.js';

const fullName = (s) => (s ? `${s.firstName} ${s.lastName}`.trim() : 'another learner');

async function loadSeatingContext(tenantId, student) {
  const [seats, allocations, openVisits] = await Promise.all([
    Seat.find({ tenantId }).lean(),
    SeatAllocation.find({ tenantId, status: 'active' }).lean(),
    Visit.find({ tenantId, isOpen: true }, 'seatId').lean(),
  ]);
  const own = allocations.filter((a) => String(a.studentId) === String(student._id));
  return { seats, allocations, openVisits, own };
}

/** Seats this learner may be put on right now, their own first. */
export async function freeSeats(tenantId, studentId) {
  const student = await Student.findOne({ _id: studentId, tenantId }, 'kind status').lean();
  if (!student) throw new AppError('Learner not found', 404);
  const { seats, allocations, openVisits, own } = await loadSeatingContext(tenantId, student);
  return freeSeatsFor({
    seats,
    allocations,
    openVisits,
    student,
    ownSeatIds: own.map((a) => a.seatId),
  });
}

// Why a visit could not be created: the seat is taken, or the learner is already in.
async function explainVisitConflict(tenantId, { seatId, studentId }) {
  const onSeat = await Visit.findOne({ tenantId, seatId, isOpen: true }).lean();
  if (onSeat && String(onSeat.studentId) !== String(studentId)) {
    const [seat, holder] = await Promise.all([
      Seat.findOne({ _id: seatId, tenantId }, 'label').lean(),
      Student.findOne({ _id: onSeat.studentId, tenantId }, 'firstName lastName').lean(),
    ]);
    const label = seat ? `Seat ${seat.label}` : 'That seat';
    return `${label} is taken by ${fullName(holder)}`;
  }
  return 'This learner is already checked in';
}

/**
 * Checks a learner in.
 *
 * Opening hours bind everyone but an owner. The shift never blocks a check-in: a
 * member may arrive at any time at no extra cost. A plan that is unpaid, expired or
 * missing produces a warning and never a refusal. The first check-in of a day also
 * marks the learner present for that day, on the centre's own calendar.
 */
export async function checkIn({
  tenant,
  studentId,
  seatId,
  recordedBy,
  isOwner,
  now = new Date(),
}) {
  const tenantId = tenant._id;

  const student = await Student.findOne({ _id: studentId, tenantId }).lean();
  if (!student) throw new AppError('Learner not found', 404);
  if (student.status !== 'active') throw new AppError('This learner is not active', 422);

  const centre = resolveCentreSettings(tenant);
  const outsideHours = !isWithinOpenHours(now, centre, tenant.timezone);
  if (outsideHours && !isOwner) {
    throw new AppError('An owner must check learners in outside opening hours', 403);
  }

  const alreadyIn = await Visit.findOne({ tenantId, studentId, isOpen: true }, '_id').lean();
  if (alreadyIn) throw new AppError('This learner is already checked in', 409);

  const { seats, allocations, openVisits, own } = await loadSeatingContext(tenantId, student);
  const free = freeSeatsFor({
    seats,
    allocations,
    openVisits,
    student,
    ownSeatIds: own.map((a) => a.seatId),
  });

  let chosen;
  if (seatId) {
    const seat = seats.find((s) => String(s._id) === String(seatId));
    if (!seat) throw new AppError('Seat not found', 404);
    if (!seat.isActive) throw new AppError('That seat is not in use', 422);
    chosen = free.find((s) => String(s.seatId) === String(seatId));
    if (!chosen) {
      // Say why: a day pass cannot take a member's seat, otherwise someone is on it.
      const heldByMember = allocations.some((a) => String(a.seatId) === String(seatId));
      if (student.kind === 'walk_in' && heldByMember) {
        throw new AppError('A walk-in can only use a seat that no member holds', 422);
      }
      throw new AppError(await explainVisitConflict(tenantId, { seatId, studentId }), 409);
    }
  } else {
    chosen = free[0];
    if (!chosen) throw new AppError('No free seat right now', 409);
  }

  const entitlement = await entitlementFor(tenantId, studentId, now);

  let visit;
  try {
    visit = await Visit.create({
      tenantId,
      studentId,
      seatId: chosen.seatId,
      inAt: now,
      isOpen: true,
      recordedBy,
      outsideHours,
      entitlementAtCheckIn: entitlement.status,
    });
  } catch (err) {
    if (err.code === 11000) {
      throw new AppError(
        await explainVisitConflict(tenantId, { seatId: chosen.seatId, studentId }),
        409
      );
    }
    throw err;
  }

  await markPresent({ tenant, student, own, recordedBy, now });

  return {
    visit,
    seat: { label: chosen.label, zone: chosen.zone },
    warning:
      entitlement.status === 'valid'
        ? null
        : { status: entitlement.status, coversTo: entitlement.coversTo },
  };
}

/**
 * One AttendanceRecord per learner per day, keyed the way every other attendance
 * write is (a UTC-midnight Date) but built here from the centre's own calendar,
 * never from the client. A member is attached to the shift of their earliest seat;
 * a walk-in to none. A "present" here overwrites an earlier manual mark the same day.
 */
async function markPresent({ tenant, student, own, recordedBy, now }) {
  const tenantId = tenant._id;
  const date = dayKeyInTz(now, tenant.timezone);
  const earliest = [...own].sort((a, b) => new Date(a.startDate) - new Date(b.startDate))[0];
  await AttendanceRecord.updateOne(
    { tenantId, date, entityType: 'student', entityId: student._id, subjectId: null },
    {
      $set: {
        tenantId,
        date,
        entityType: 'student',
        entityId: student._id,
        subjectId: null,
        status: 'present',
        markedBy: recordedBy,
        ...(earliest ? { sectionId: earliest.sectionId } : {}),
      },
    },
    { upsert: true }
  );
}

export async function checkOut({ tenantId, visitId, now = new Date() }) {
  const visit = await Visit.findOneAndUpdate(
    { _id: visitId, tenantId, isOpen: true },
    { $set: { outAt: now }, $unset: { isOpen: '' } },
    { new: true }
  );
  if (!visit) throw new AppError('Visit not found, or already closed', 404);
  return visit;
}

/** Who is in right now, with names and seats. */
export async function listOpenVisits(tenantId) {
  const visits = await Visit.find({ tenantId, isOpen: true }).sort({ inAt: 1, _id: 1 }).lean();
  const [students, seats] = await Promise.all([
    Student.find(
      { tenantId, _id: { $in: visits.map((v) => v.studentId) } },
      'firstName lastName kind phone'
    ).lean(),
    Seat.find({ tenantId, _id: { $in: visits.map((v) => v.seatId) } }, 'label zone').lean(),
  ]);
  const byStudent = new Map(students.map((s) => [String(s._id), s]));
  const bySeat = new Map(seats.map((s) => [String(s._id), s]));
  return visits.map((v) => ({
    _id: v._id,
    inAt: v.inAt,
    outsideHours: v.outsideHours,
    entitlementAtCheckIn: v.entitlementAtCheckIn,
    student: {
      _id: v.studentId,
      name: fullName(byStudent.get(String(v.studentId))),
      kind: byStudent.get(String(v.studentId))?.kind ?? 'member',
    },
    seat: {
      label: bySeat.get(String(v.seatId))?.label ?? '—',
      zone: bySeat.get(String(v.seatId))?.zone ?? null,
    },
  }));
}

/**
 * Closes visits nobody checked out, across every tenant. Called by the sweeper.
 * Idempotent: a visit already closed is no longer open, so the second run finds
 * nothing to do.
 */
export async function autoCloseVisits(now = new Date()) {
  const open = await Visit.find({ isOpen: true }, null, { _bypassTenantScope: true }).lean();
  if (!open.length) return 0;

  const tenantDocs = await Tenant.find(
    { _id: { $in: [...new Set(open.map((v) => String(v.tenantId)))] } },
    'orgType timezone settings'
  ).lean();
  const tenants = new Map(tenantDocs.map((t) => [String(t._id), t]));

  const due = selectVisitsToClose({ openVisits: open, tenants, now });
  let closed = 0;
  for (const { visitId, tenantId, outAt } of due) {
    const res = await Visit.updateOne(
      { _id: visitId, tenantId, isOpen: true },
      { $set: { outAt, autoClosed: true }, $unset: { isOpen: '' } }
    );
    closed += res.modifiedCount;
  }
  return closed;
}
