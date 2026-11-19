import { calculateEffectiveTotal } from './feeCalculations.js';
import { dayKeyOf, isBillingAssignment } from './billingCycle.js';

/**
 * A learner's plan line and next amount due, for their own page.
 *
 * A monthly/weekly fee plan, when the learner has one, is the plan line: its name,
 * cycle and state (`billing` carries the structure name and its computed ledger).
 * Otherwise the plan is the desk-sold one covering `at`, or else the one that ended
 * last (so an expired plan still shows when it ended).
 *
 * The next due is the earliest of: the fee plan's next due (from its ledger) and the
 * earliest unpaid or partly paid other assignment, with refunded payments left out
 * of what has been paid.
 */
export function summarizePlan({ assignments, payments, structureNames, billing, at = new Date() }) {
  const plans = assignments.filter((a) => a.coversFrom && a.coversTo);
  const time = at.getTime();
  const covering = plans.filter(
    (a) => new Date(a.coversFrom).getTime() <= time && time <= new Date(a.coversTo).getTime()
  );
  const byEndDesc = (a, b) => new Date(b.coversTo) - new Date(a.coversTo);
  const current = [...(covering.length ? covering : plans)].sort(byEndDesc)[0];

  const paidFor = (assignment) =>
    payments
      .filter((p) => String(p.assignmentId) === String(assignment._id) && !p.refunded)
      .reduce((sum, p) => sum + p.amount, 0);

  const owing = assignments
    .filter((a) => !isBillingAssignment(a) && (a.status === 'unpaid' || a.status === 'partial'))
    .map((a) => ({
      amount: calculateEffectiveTotal(a) - paidFor(a),
      dueDate: a.dueDate ?? a.coversFrom ?? null,
    }))
    .filter(({ amount }) => amount > 0);
  if (billing?.ledger.nextDue) {
    const { amount, dueOn } = billing.ledger.nextDue;
    owing.push({ amount, dueDate: dayKeyOf(dueOn) });
  }
  owing.sort((x, y) => new Date(x.dueDate ?? 0) - new Date(y.dueDate ?? 0));

  let plan = null;
  if (billing) {
    plan = { name: billing.name ?? null, cycle: billing.cycle, state: billing.ledger.state };
  } else if (current) {
    plan = {
      name: structureNames.get(String(current.feeStructureId)) ?? null,
      coversFrom: current.coversFrom,
      coversTo: current.coversTo,
    };
  }

  return { plan, nextDue: owing[0] ?? null };
}
