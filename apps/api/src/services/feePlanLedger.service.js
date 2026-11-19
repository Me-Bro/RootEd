import { FeeDiscount } from '../models/FeeDiscount.js';
import { FeePayment } from '../models/FeePayment.js';
import { buildLedger } from '../utils/billingCycle.js';
import { dayStringInTz } from '../utils/dayKey.js';

/**
 * The cycle ledger of one billing assignment as of `now`, in the centre's calendar,
 * from the learner's own standing discounts and the assignment's live payments.
 * Kept apart from fee.service.js so both that file and feePlan.service.js can use it
 * without importing each other.
 */
export async function loadBillingLedger({ tenant, assignment, now = new Date() }) {
  const tenantId = tenant._id;
  const [discounts, payments] = await Promise.all([
    FeeDiscount.find({ tenantId, applicableTo: 'student', studentId: assignment.studentId }).lean(),
    FeePayment.find(
      { tenantId, assignmentId: assignment._id, refunded: { $ne: true } },
      'amount refunded'
    ).lean(),
  ]);
  return buildLedger({
    billing: assignment.billing,
    discounts,
    payments,
    today: dayStringInTz(now, tenant.timezone),
    studentId: assignment.studentId,
  });
}
