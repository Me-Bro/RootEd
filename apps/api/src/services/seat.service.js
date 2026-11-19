import { Seat } from '../models/Seat.js';
import { SeatAllocation } from '../models/SeatAllocation.js';
import { Student } from '../models/Student.js';
import { Section } from '../models/Section.js';
import { Enrollment } from '../models/Enrollment.js';
import { AppError } from '../middleware/errorHandler.js';
import { buildAvailability, bulkLabels } from '../utils/seatAvailability.js';
import { fullName } from '../utils/fullName.js';
import { shiftsOverlap } from '../utils/shiftOverlap.js';

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

/**
 * Frees every seat a learner holds, in every shift: their billing was paused or they
 * withdrew. The seats are free for others at once (the unique indexes only cover
 * active holds). Returns how many holds were ended.
 */
export async function endAllAllocationsFor(tenantId, studentId) {
  const result = await SeatAllocation.updateMany(
    { tenantId, studentId, status: 'active' },
    { $set: { status: 'ended', endDate: new Date() } }
  );
  return result.modifiedCount;
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
  const section = await Section.findOne({ _id: sectionId, tenantId }, SHIFT_FIELDS).lean();
  if (!section) throw new AppError('Shift not found', 404);

  const [seats, anyAllocations] = await Promise.all([
    Seat.find({ tenantId }).lean(),
    SeatAllocation.find({ tenantId, status: 'active' }).lean(),
  ]);
  const inShift = (a) => String(a.sectionId) === String(sectionId);
  const shiftAllocations = anyAllocations.filter(inShift);

  // Holds in other shifts that share hours with this one: those seats cannot be given here.
  const elsewhere = anyAllocations.filter((a) => !inShift(a));
  const otherSections = await Section.find(
    { tenantId, _id: { $in: [...new Set(elsewhere.map((a) => String(a.sectionId)))] } },
    SHIFT_FIELDS
  ).lean();
  const sectionById = new Map(otherSections.map((s) => [String(s._id), s]));
  const overlapping = elsewhere
    .map((a) => ({ ...a, section: sectionById.get(String(a.sectionId)) }))
    .filter((a) => a.section && shiftsOverlap(section, a.section));

  const students = await Student.find(
    {
      tenantId,
      _id: { $in: [...shiftAllocations, ...overlapping].map((a) => a.studentId) },
    },
    'firstName lastName'
  ).lean();
  const names = new Map(students.map((s) => [String(s._id), fullName(s)]));

  return buildAvailability({
    seats,
    shiftAllocations,
    anyAllocations,
    overlapping,
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

const SHIFT_FIELDS = 'name startTime endTime';

// "06:00–14:00", or "all day" for a shift with no hours at all.
function hoursLabel({ startTime, endTime }) {
  if (!startTime && !endTime) return 'all day';
  return `${startTime ?? '00:00'}–${endTime ?? '24:00'}`;
}

/**
 * Active holds on this seat in OTHER shifts whose hours overlap `target` (a section with
 * its hours). One chair cannot belong to two members at the same time of day, and the
 * unique indexes only see one section at a time, so this is checked here. Returns
 * `[{ hold, section }]`, empty when the seat is clear.
 */
async function findOverlapConflicts(tenantId, { seatId, sectionId }, target) {
  const [section, holds] = await Promise.all([
    target ?? Section.findOne({ _id: sectionId, tenantId }, SHIFT_FIELDS).lean(),
    SeatAllocation.find({
      tenantId,
      seatId,
      status: 'active',
      sectionId: { $ne: sectionId },
    }).lean(),
  ]);
  if (!section || !holds.length) return [];
  const sections = await Section.find(
    { tenantId, _id: { $in: holds.map((h) => h.sectionId) } },
    SHIFT_FIELDS
  ).lean();
  const byId = new Map(sections.map((s) => [String(s._id), s]));
  return holds
    .map((hold) => ({ hold, section: byId.get(String(hold.sectionId)) }))
    .filter((c) => c.section && shiftsOverlap(section, c.section));
}

async function explainOverlap(tenantId, seatId, target, conflicts) {
  const [seat, students] = await Promise.all([
    Seat.findOne({ _id: seatId, tenantId }, 'label').lean(),
    Student.find(
      { tenantId, _id: { $in: conflicts.map((c) => c.hold.studentId) } },
      'firstName lastName'
    ).lean(),
  ]);
  const names = new Map(students.map((s) => [String(s._id), fullName(s)]));
  const who = conflicts
    .map(
      (c) =>
        `${names.get(String(c.hold.studentId)) ?? 'another learner'} in ${c.section.name} (${hoursLabel(c.section)})`
    )
    .join(', ');
  const label = seat ? `Seat ${seat.label}` : 'That seat';
  return `${label} is held by ${who}, which overlaps ${target.name} (${hoursLabel(target)})`;
}

async function assertCanSit(tenantId, { studentId, sectionId, seatId }) {
  const [student, section, seat, enrollment] = await Promise.all([
    Student.findOne({ _id: studentId, tenantId }, 'kind status').lean(),
    Section.findOne({ _id: sectionId, tenantId }, SHIFT_FIELDS).lean(),
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

  const conflicts = await findOverlapConflicts(tenantId, { seatId, sectionId }, section);
  if (conflicts.length) {
    throw new AppError(await explainOverlap(tenantId, seatId, section, conflicts), 409);
  }
}

/**
 * Refuses a batch edit that would make its seats overlap another batch's holds. `before`
 * and `after` are `{ name, startTime, endTime }` for the batch's shift. Only conflicts the
 * edit introduces count: a clash that already exists (older data) does not block an edit
 * that leaves it as it was or narrows it, so the owner can still tidy up by shrinking hours.
 */
export async function assertHoursKeepSeatsClear(tenantId, classId, { before, after }) {
  const sections = await Section.find({ tenantId, classId }, '_id').lean();
  const sectionIds = sections.map((s) => s._id);
  const mine = await SeatAllocation.find({
    tenantId,
    sectionId: { $in: sectionIds },
    status: 'active',
  }).lean();
  if (!mine.length) return;

  const others = await SeatAllocation.find({
    tenantId,
    seatId: { $in: mine.map((h) => h.seatId) },
    status: 'active',
    sectionId: { $nin: sectionIds },
  }).lean();
  if (!others.length) return;

  const otherSections = await Section.find(
    { tenantId, _id: { $in: others.map((h) => h.sectionId) } },
    SHIFT_FIELDS
  ).lean();
  const sectionById = new Map(otherSections.map((s) => [String(s._id), s]));

  const clashes = [];
  for (const hold of mine) {
    for (const other of others) {
      if (String(other.seatId) !== String(hold.seatId)) continue;
      const section = sectionById.get(String(other.sectionId));
      if (!section) continue;
      if (shiftsOverlap(after, section) && !shiftsOverlap(before, section)) {
        clashes.push({ hold: other, section });
      }
    }
  }
  if (!clashes.length) return;

  const [seats, students] = await Promise.all([
    Seat.find({ tenantId, _id: { $in: clashes.map((c) => c.hold.seatId) } }, 'label').lean(),
    Student.find(
      { tenantId, _id: { $in: clashes.map((c) => c.hold.studentId) } },
      'firstName lastName'
    ).lean(),
  ]);
  const labels = new Map(seats.map((s) => [String(s._id), s.label]));
  const names = new Map(students.map((s) => [String(s._id), fullName(s)]));
  const list = clashes
    .map(
      (c) =>
        `${labels.get(String(c.hold.seatId)) ?? 'a seat'} (${names.get(String(c.hold.studentId)) ?? 'another learner'} in ${c.section.name}, ${hoursLabel(c.section)})`
    )
    .join(', ');
  throw new AppError(
    `${after.name} would be ${hoursLabel(after)}, which overlaps seats held in other batches: ${list}. Move or end those seats first.`,
    409
  );
}

/**
 * Creates the hold. The partial unique indexes settle two holds on the same seat in the
 * same shift, but not two in overlapping shifts, so once the row exists it is checked
 * again: if a hold in an overlapping shift slipped in at the same moment, the one with
 * the later _id removes itself. Both sides see each other, so exactly one survives.
 */
async function createHold(tenantId, input) {
  let hold;
  try {
    hold = await SeatAllocation.create({ tenantId, ...input, status: 'active' });
  } catch (err) {
    if (err.code === 11000) throw new AppError(await explainConflict(tenantId, input), 409);
    throw err;
  }

  const conflicts = await findOverlapConflicts(tenantId, input);
  if (conflicts.some((c) => String(c.hold._id) < String(hold._id))) {
    await SeatAllocation.deleteOne({ _id: hold._id, tenantId });
    const target = await Section.findOne({ _id: input.sectionId, tenantId }, SHIFT_FIELDS).lean();
    throw new AppError(await explainOverlap(tenantId, input.seatId, target, conflicts), 409);
  }
  return hold;
}

export async function assignSeat(tenantId, input) {
  await assertCanSit(tenantId, input);
  return createHold(tenantId, input);
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
    return await createHold(tenantId, input);
  } catch (err) {
    await SeatAllocation.updateOne(
      { _id: allocationId, tenantId },
      { $set: { status: 'active' }, $unset: { endDate: '' } }
    );
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
