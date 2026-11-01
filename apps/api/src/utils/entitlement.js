const PAID = new Set(['paid', 'waived']);

/**
 * Whether a learner may use the centre at `at`, from their fee assignments.
 *
 *  - valid:   a paid (or waived) assignment covers `at`
 *  - unpaid:  an assignment covers `at` but is unpaid or only partly paid
 *  - expired: they have had a plan, but none covers `at`
 *  - none:    they have never had a plan
 *
 * Only assignments with a coverage period count (a school fee has none). A refund
 * drops an assignment back to unpaid through the fee service, so it is handled
 * here with no special case. `coversTo` is the end of the period that decided it.
 */
export function classifyEntitlement(assignments, at = new Date()) {
  const plans = assignments.filter((a) => a.coversFrom && a.coversTo);
  if (plans.length === 0) return { status: 'none', coversTo: null };

  const time = at.getTime();
  const covering = plans.filter(
    (a) => new Date(a.coversFrom).getTime() <= time && time <= new Date(a.coversTo).getTime()
  );
  const latestEnd = (list) =>
    new Date(Math.max(...list.map((a) => new Date(a.coversTo).getTime())));

  const paid = covering.filter((a) => PAID.has(a.status));
  if (paid.length) return { status: 'valid', coversTo: latestEnd(paid) };
  if (covering.length) return { status: 'unpaid', coversTo: latestEnd(covering) };
  return { status: 'expired', coversTo: latestEnd(plans) };
}
