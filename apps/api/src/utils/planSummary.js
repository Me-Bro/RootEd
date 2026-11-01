import { calculateEffectiveTotal } from './feeCalculations.js';

/**
 * A learner's plan line and next amount due, for their own page.
 *
 * The plan is the one covering `at`, or else the one that ended last (so an expired
 * plan still shows when it ended). The next due is the earliest unpaid or partly
 * paid assignment, with refunded payments left out of what has been paid.
 */
export function summarizePlan({ assignments, payments, structureNames, at = new Date() }) {
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
    .filter((a) => a.status === 'unpaid' || a.status === 'partial')
    .map((a) => ({ a, amount: calculateEffectiveTotal(a) - paidFor(a) }))
    .filter(({ amount }) => amount > 0)
    .sort(
      (x, y) =>
        new Date(x.a.dueDate ?? x.a.coversFrom ?? 0) - new Date(y.a.dueDate ?? y.a.coversFrom ?? 0)
    )[0];

  return {
    plan: current
      ? {
          name: structureNames.get(String(current.feeStructureId)) ?? null,
          coversFrom: current.coversFrom,
          coversTo: current.coversTo,
        }
      : null,
    nextDue: owing
      ? { amount: owing.amount, dueDate: owing.a.dueDate ?? owing.a.coversFrom ?? null }
      : null,
  };
}
