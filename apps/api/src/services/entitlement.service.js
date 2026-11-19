import { FeeAssignment } from '../models/FeeAssignment.js';
import { Tenant } from '../models/Tenant.js';
import { classifyEntitlement } from '../utils/entitlement.js';
import { billingEntitlement, isBillingAssignment } from '../utils/billingCycle.js';
import { ledgersFor, loadBillingLedger } from './feePlanLedger.service.js';

/**
 * May this learner use the centre right now?
 *
 * A learner on a monthly/weekly fee plan is answered from its ledger: `valid` unless
 * something is overdue (`unpaid`), or billing is `paused`, `ended` (withdrawn) or not
 * started yet (`scheduled`). Anyone else is answered, as before, from their fee
 * assignments that carry a coverage period (all of them, with no date window in the
 * query, so "expired" can be told from "never had a plan"). A learner has few.
 */
export async function entitlementFor(tenantId, studentId, at = new Date()) {
  const plan = await FeeAssignment.findOne(
    { tenantId, studentId, billing: { $exists: true } },
    'studentId billing'
  ).lean();
  if (plan) {
    const tenant = await Tenant.findById(tenantId, 'timezone').lean();
    const ledger = await loadBillingLedger({
      tenant: { ...tenant, _id: tenantId },
      assignment: plan,
      now: at,
    });
    return {
      status: billingEntitlement(ledger),
      coversTo: null,
      overdue: ledger.overdue,
      nextDue: ledger.nextDue,
    };
  }

  const assignments = await FeeAssignment.find(
    { tenantId, studentId, coversTo: { $exists: true, $ne: null } },
    'status coversFrom coversTo'
  ).lean();
  return classifyEntitlement(assignments, at);
}

/**
 * `entitlementFor` for many learners at once (the front-desk list), keyed by student
 * id: one assignments query, plus the batched ledgers for those on a billing plan.
 * `tenant` needs `_id` and `timezone`.
 */
export async function entitlementsFor(tenant, studentIds, at = new Date()) {
  const result = new Map();
  if (!studentIds.length) return result;

  const assignments = await FeeAssignment.find(
    {
      tenantId: tenant._id,
      studentId: { $in: studentIds },
      $or: [{ billing: { $exists: true } }, { coversTo: { $exists: true, $ne: null } }],
    },
    'studentId status coversFrom coversTo billing'
  ).lean();

  const byStudent = new Map();
  for (const a of assignments) {
    const key = String(a.studentId);
    if (!byStudent.has(key)) byStudent.set(key, []);
    byStudent.get(key).push(a);
  }

  const billing = assignments.filter(isBillingAssignment);
  const ledgers = await ledgersFor({ tenant, assignments: billing, now: at });
  const billed = new Map(billing.map((a) => [String(a.studentId), a]));

  for (const studentId of studentIds) {
    const key = String(studentId);
    const plan = billed.get(key);
    if (plan) {
      const ledger = ledgers.get(String(plan._id));
      result.set(key, {
        status: billingEntitlement(ledger),
        coversTo: null,
        overdue: ledger.overdue,
        nextDue: ledger.nextDue,
      });
    } else {
      const own = (byStudent.get(key) ?? []).filter((a) => a.coversTo);
      result.set(key, classifyEntitlement(own, at));
    }
  }
  return result;
}
