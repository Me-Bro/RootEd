import { Seat } from '../models/Seat.js';
import { SeatAllocation } from '../models/SeatAllocation.js';
import { Student } from '../models/Student.js';
import { Section } from '../models/Section.js';
import { Enrollment } from '../models/Enrollment.js';
import { AppError } from '../middleware/errorHandler.js';
import { buildAvailability, bulkLabels } from '../utils/seatAvailability.js';
import { fullName } from '../utils/fullName.js';

/**
 * A learner who has left a shift no longer holds its seat. Called wherever an
 * enrollment ends. A no-op for tenants with no allocations, so it is safe to call
 * from the shared enrollment route that school and college tenants also use.
 */
export async function endAllocationsFor(tenantId, studentId, sectionId) {
  await SeatAllocation.updateMany(
    { tenantId, studentId, sectionId, status: 'active' },
    { $set: { status: 'ended', endDate: new Date() } }
  );
}

export async function createSeats(tenantId, { prefix, count, start, zone }) {
  const labels = bulkLabels({ prefix, count, start });
  const existing = await Seat.find({ tenantId, label: { $in: labels } }, 'label').lean();
  const taken = new Set(existing.map((s) => s.label));
  const fresh = labels.filter((l) => !taken.has(l));
  if (fresh.length) {
    await Seat.insertMany(
      fresh.map((label) => ({ tenantId, label, ...(zone ? { zone } : {}) })),
      { ordered: false }
    );
  }
  return { created: fresh.length, skipped: labels.length - fresh.length };
}

/** Seats of one shift with who holds each, and the day-pass pool size. */
export async function loadAvailability(tenantId, sectionId) {
  const section = await Section.findOne({ _id: sectionId, tenantId }, '_id').lean();
  if (!section) throw new AppError('Shift not found', 404);

  const [seats, anyAllocations] = await Promise.all([
    Seat.find({ tenantId }).lean(),
    SeatAllocation.find({ tenantId, status: 'active' }).lean(),
  ]);
  const shiftAllocations = anyAllocations.filter((a) => String(a.sectionId) === String(sectionId));

  const students = await Student.find(
    { tenantId, _id: { $in: shiftAllocations.map((a) => a.studentId) } },
    'firstName lastName'
  ).lean();
  const names = new Map(students.map((s) => [String(s._id), fullName(s)]));

  return buildAvailability({
    seats,
    shiftAllocations,
    anyAllocations,
    holderName: (id) => names.get(String(id)) ?? 'another learner',
  });
}

// Why a create failed on the partial unique indexes: name the person or the seat.
async function explainConflict(tenantId, { seatId, studentId, sectionId }) {
  const onSeat = await SeatAllocation.findOne({
    tenantId,
    seatId,
    sectionId,
    status: 'active',
  }).lean();
  if (onSeat && String(onSeat.studentId) !== String(studentId)) {
    const [seat, holder] = await Promise.all([
      Seat.findOne({ _id: seatId, tenantId }, 'label').lean(),
      Student.findOne({ _id: onSeat.studentId, tenantId }, 'firstName lastName').lean(),
    ]);
    const label = seat ? `Seat ${seat.label}` : 'That seat';
    return `${label} is held by ${fullName(holder)} in this shift`;
  }
  const own = await SeatAllocation.findOne({ tenantId, studentId, sectionId, status: 'active' })
    .populate('seatId', 'label')
    .lean();
  if (own) {
    return own.seatId?.label
      ? `This learner already has seat ${own.seatId.label} in this shift`
      : 'This learner already has a seat in this shift';
  }
  return 'That seat is already taken in this shift';
}

async function assertCanSit(tenantId, { studentId, sectionId, seatId }) {
  const [student, section, seat, enrollment] = await Promise.all([
    Student.findOne({ _id: studentId, tenantId }, 'kind status').lean(),
    Section.findOne({ _id: sectionId, tenantId }, '_id').lean(),
    Seat.findOne({ _id: seatId, tenantId }, 'isActive label').lean(),
    Enrollment.findOne({ tenantId, studentId, sectionId, status: 'active' }, '_id').lean(),
  ]);
  if (!student) throw new AppError('Learner not found', 404);
  if (!section) throw new AppError('Shift not found', 404);
  if (!seat) throw new AppError('Seat not found', 404);
  // A walk-in's seat is chosen at check-in and lasts a day; it is never standing.
  if (student.kind === 'walk_in') {
    throw new AppError('A walk-in cannot hold a standing seat', 422);
  }
  if (!seat.isActive) throw new AppError('That seat is not in use', 422);
  if (!enrollment) throw new AppError('Enrol the learner in this shift first', 422);
}

export async function assignSeat(tenantId, input) {
  await assertCanSit(tenantId, input);
  try {
    return await SeatAllocation.create({ tenantId, ...input, status: 'active' });
  } catch (err) {
    if (err.code === 11000) throw new AppError(await explainConflict(tenantId, input), 409);
    throw err;
  }
}

export async function endAllocation(tenantId, allocationId) {
  const allocation = await SeatAllocation.findOneAndUpdate(
    { _id: allocationId, tenantId, status: 'active' },
    { $set: { status: 'ended', endDate: new Date() } },
    { new: true }
  );
  if (!allocation) throw new AppError('Allocation not found', 404);
  return allocation;
}

/**
 * Ends the old hold and creates the new one. If the new seat turns out to be taken
 * (a race the index decides), the old hold is put back, so a failed move leaves
 * the learner where they were.
 */
export async function moveAllocation(tenantId, allocationId, seatId) {
  const current = await SeatAllocation.findOne({
    _id: allocationId,
    tenantId,
    status: 'active',
  }).lean();
  if (!current) throw new AppError('Allocation not found', 404);
  if (String(current.seatId) === String(seatId)) return current;

  const input = { studentId: current.studentId, sectionId: current.sectionId, seatId };
  await assertCanSit(tenantId, input);

  await endAllocation(tenantId, allocationId);
  try {
    return await SeatAllocation.create({ tenantId, ...input, status: 'active' });
  } catch (err) {
    await SeatAllocation.updateOne(
      { _id: allocationId, tenantId },
      { $set: { status: 'active' }, $unset: { endDate: '' } }
    );
    if (err.code === 11000) throw new AppError(await explainConflict(tenantId, input), 409);
    throw err;
  }
}

/** A seat cannot be taken out of use while someone holds it. */
export async function assertSeatCanBeDeactivated(tenantId, seatId) {
  const holds = await SeatAllocation.find({ tenantId, seatId, status: 'active' }).lean();
  if (!holds.length) return;
  const students = await Student.find(
    { tenantId, _id: { $in: holds.map((h) => h.studentId) } },
    'firstName lastName'
  ).lean();
  throw new AppError(
    `This seat is held by ${students.map(fullName).join(', ')}. End or move their seat first.`,
    409
  );
}
