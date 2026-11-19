import { FeeStructure } from '../models/FeeStructure.js';
import { FeeAssignment } from '../models/FeeAssignment.js';
import { FeePayment } from '../models/FeePayment.js';
import { Student } from '../models/Student.js';
import { AppError } from '../middleware/errorHandler.js';
import { assignFeesToStudents } from './fee.service.js';
import { calculateMandatoryTotal } from '../utils/feeCalculations.js';
import { dayStringInTz } from '../utils/dayKey.js';
import {
  isBillingAssignment,
  validateStartDay,
  dayKeyOf,
  dayStringOf,
} from '../utils/billingCycle.js';

/**
 * Study-center fee plans, set from the learner's page.
 *
 * A structure with a `cycle` makes the learner's single billing assignment: one
 * FeeAssignment whose `billing` timeline the ledger is computed from. Any other
 * structure (no cycle, no plan) is a one-off fee, assigned alongside it as before.
 */

/** A study-center structure a learner may be put on: this tenant's, active, not desk-sold. */
export async function findAssignableStructure(tenantId, feeStructureId) {
  return FeeStructure.findOne({
    _id: feeStructureId,
    tenantId,
    isActive: { $ne: false },
    'plan.kind': { $exists: false },
  }).lean();
}

const segmentFor = (structure, fromKey) => ({
  feeStructureId: structure._id,
  cycle: structure.cycle,
  amount: calculateMandatoryTotal(structure.components),
  from: fromKey,
});

function assertStartDay(startDay, today) {
  if (validateStartDay({ startDay, today })) {
    throw new AppError('The start date can be at most 31 days in the past', 422);
  }
}

/** Throws unless `startDay` is an acceptable billing start for a new plan. */
export function checkNewPlanStartDay({ tenant, startDay, now = new Date() }) {
  assertStartDay(startDay, dayStringInTz(now, tenant.timezone));
}

/**
 * Put a learner on a cycle structure, or move them to another one.
 *
 *  - First plan: billing starts on `startDay` (default today in the centre).
 *  - Same structure again: nothing changes.
 *  - A plan that has not started yet is simply replaced (keeping its start unless a
 *    new one is given).
 *  - Otherwise the current structure stops and the new one starts on `startDay`
 *    (default today); both prorate, and the payments stay on one ledger. A change on
 *    the very day the current structure started replaces it.
 *
 * Returns { result: 'created' | 'changed' | 'unchanged', assignment }.
 */
export async function setCyclePlan({ tenant, studentId, structure, startDay, now = new Date() }) {
  const tenantId = tenant._id;
  if (!structure.cycle) throw new AppError('This fee structure has no billing cycle', 422);

  const today = dayStringInTz(now, tenant.timezone);
  const existing = await FeeAssignment.findOne({ tenantId, studentId, billing: { $exists: true } });

  if (!existing) {
    const from = startDay ?? today;
    assertStartDay(from, today);
    try {
      const assignment = await FeeAssignment.create({
        tenantId,
        studentId,
        feeStructureId: structure._id,
        academicYearId: structure.academicYearId,
        totalAmount: calculateMandatoryTotal(structure.components),
        billing: { segments: [segmentFor(structure, dayKeyOf(from))], pauses: [] },
      });
      return { result: 'created', assignment };
    } catch (err) {
      if (err.code === 11000) throw new AppError('This learner already has a fee plan', 409);
      throw err;
    }
  }

  if (existing.billing.endedOn) {
    throw new AppError("This learner's billing has ended", 422);
  }
  const segments = existing.billing.segments;
  const open = segments[segments.length - 1];
  if (String(open.feeStructureId) === String(structure._id)) {
    return { result: 'unchanged', assignment: existing };
  }

  const openFrom = dayStringOf(open.from);
  const notStarted = openFrom > today;
  const changeDay = startDay ?? (notStarted ? openFrom : today);
  assertStartDay(changeDay, today);
  if (changeDay < openFrom && !notStarted) {
    throw new AppError(`The change can start no earlier than ${openFrom}`, 422);
  }

  const next = segmentFor(structure, dayKeyOf(changeDay));
  if (notStarted || changeDay === openFrom) {
    segments.splice(segments.length - 1, 1, next);
  } else {
    open.to = dayKeyOf(changeDay);
    segments.push(next);
  }
  existing.feeStructureId = structure._id;
  existing.totalAmount = next.amount;

  try {
    await existing.save();
  } catch (err) {
    if (err.name === 'VersionError') {
      throw new AppError('The fee plan was changed at the same time, please retry', 409);
    }
    throw err;
  }
  return { result: 'changed', assignment: existing };
}

/** Assign a one-off structure (no cycle, no plan) to the learner, alongside the rest. */
export async function addOneOff({ tenantId, studentId, structure }) {
  if (structure.cycle) throw new AppError('This fee structure has a billing cycle', 422);
  return assignFeesToStudents({ studentIds: [studentId], feeStructureId: structure._id, tenantId });
}

/** Remove a one-off fee from a learner while nothing has been paid against it. */
export async function removeOneOff({ tenantId, studentId, assignmentId }) {
  const assignment = await FeeAssignment.findOne({ _id: assignmentId, tenantId, studentId }).lean();
  if (!assignment) throw new AppError('Fee not found', 404);
  if (isBillingAssignment(assignment) || assignment.coversFrom) {
    throw new AppError('Only a one-off fee can be removed here', 422);
  }
  const paid = await FeePayment.exists({ tenantId, assignmentId, refunded: { $ne: true } });
  if (paid) throw new AppError('Payments were recorded against this fee', 409);
  await FeeAssignment.deleteOne({ _id: assignmentId, tenantId });
  return assignment;
}

/** The learner must belong to the tenant, be an active member, and not a walk-in. */
export async function findBillableLearner(tenantId, studentId) {
  const student = await Student.findOne({ _id: studentId, tenantId }, 'kind status').lean();
  if (!student) throw new AppError('Student not found', 404);
  if (student.kind === 'walk_in') throw new AppError('Walk-ins buy a day pass instead', 400);
  if (student.status !== 'active') throw new AppError('This learner is not active', 422);
  return student;
}
