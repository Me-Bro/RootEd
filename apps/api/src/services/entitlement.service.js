import { FeeAssignment } from '../models/FeeAssignment.js';
import { classifyEntitlement } from '../utils/entitlement.js';

/**
 * May this learner use the centre right now? Reads their fee assignments that carry
 * a coverage period (all of them, with no date window in the query, so "expired" can
 * be told from "never had a plan") and classifies them. A learner has few.
 */
export async function entitlementFor(tenantId, studentId, at = new Date()) {
  const assignments = await FeeAssignment.find(
    { tenantId, studentId, coversTo: { $exists: true, $ne: null } },
    'status coversFrom coversTo'
  ).lean();
  return classifyEntitlement(assignments, at);
}
