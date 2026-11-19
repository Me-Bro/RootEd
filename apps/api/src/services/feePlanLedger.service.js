import { FeeDiscount } from '../models/FeeDiscount.js';
import { FeePayment } from '../models/FeePayment.js';
import { Tenant } from '../models/Tenant.js';
import { buildLedger, isBillingAssignment } from '../utils/billingCycle.js';
import { dayStringInTz } from '../utils/dayKey.js';

/**
 * Cycle ledgers of study-center fee plans, computed on read from the learners' own
 * standing discounts and the plans' live payments, in the centre's calendar. Kept
 * apart from fee.service.js so both that file and feePlan.service.js can use it
 * without importing each other.
 */

/** The ledger of one billing assignment as of `now`. */
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

/**
 * Ledgers for every billing assignment in `assignments` (others are skipped), keyed
 * by assignment id, with one discounts query and one payments query in all. Callers
 * that already summed the live payments per assignment pass `paidById` to skip that
 * query. `tenant` needs `_id` and `timezone`; a bare tenant id is looked up.
 */
export async function ledgersFor({ tenant, tenantId, assignments, paidById, now = new Date() }) {
  const plans = assignments.filter(isBillingAssignment);
  const ledgers = new Map();
  if (!plans.length) return ledgers;

  const centre = tenant ?? (await Tenant.findById(tenantId, 'timezone').lean());
  const id = tenant?._id ?? tenantId;
  const studentIds = plans.map((p) => p.studentId?._id ?? p.studentId);

  const [discounts, paid] = await Promise.all([
    FeeDiscount.find({
      tenantId: id,
      applicableTo: 'student',
      studentId: { $in: studentIds },
    }).lean(),
    paidById ??
      FeePayment.aggregate([
        {
          $match: {
            tenantId: id,
            assignmentId: { $in: plans.map((p) => p._id) },
            refunded: { $ne: true },
          },
        },
        { $group: { _id: '$assignmentId', total: { $sum: '$amount' } } },
      ]).then((rows) => new Map(rows.map((r) => [String(r._id), r.total]))),
  ]);

  const today = dayStringInTz(now, centre?.timezone);
  for (const plan of plans) {
    const studentId = plan.studentId?._id ?? plan.studentId;
    const total = paid.get(String(plan._id)) ?? 0;
    ledgers.set(
      String(plan._id),
      buildLedger({
        billing: plan.billing,
        discounts: discounts.filter((d) => String(d.studentId) === String(studentId)),
        // Payments settle the oldest cycle first, so their total is all that matters.
        payments: total ? [{ amount: total }] : [],
        today,
        studentId,
      })
    );
  }
  return ledgers;
}

/** What a list or summary shows of a ledger: the balances, not every cycle. */
export const ledgerTotals = ({ state, overdue, current, credit, payableNow, nextDue }) => ({
  state,
  overdue,
  current,
  credit,
  payableNow,
  nextDue,
});
