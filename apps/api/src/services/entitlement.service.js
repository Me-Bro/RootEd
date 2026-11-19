import { FeeAssignment } from '../models/FeeAssignment.js';
import { Tenant } from '../models/Tenant.js';
import { classifyEntitlement } from '../utils/entitlement.js';
import { billingEntitlement } from '../utils/billingCycle.js';
import { loadBillingLedger } from './feePlanLedger.service.js';

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
