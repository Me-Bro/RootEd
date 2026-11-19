/**
 * School-wide fee rollup from already-fetched assignments + the existing
 * getDefaulters() result — no new query shape, just arithmetic over data the
 * app already fetches elsewhere, so this stays a pure function.
 *
 * A study-center fee plan has no fixed total, so its share comes from its computed
 * ledger (`ledgers`, keyed by assignment id): what has been billed so far (closed and
 * current cycles), everything paid against it, and what is overdue.
 */
export function summarizeFeeCollection(
  assignments,
  defaulters,
  today = new Date(),
  ledgers = new Map()
) {
  let totalAssigned = 0;
  let totalCollected = 0;
  let overdueTotal = 0;
  for (const assignment of assignments) {
    const ledger = ledgers.get(String(assignment._id));
    if (ledger) {
      for (const cycle of ledger.cycles) {
        totalAssigned += cycle.net;
        totalCollected += cycle.paid;
      }
      totalCollected += ledger.credit;
      overdueTotal += ledger.overdue;
      continue;
    }
    totalAssigned += assignment.totalAmount ?? 0;
    for (const installment of assignment.installments ?? []) {
      totalCollected += installment.paidAmount ?? 0;
    }
  }

  for (const defaulter of defaulters) {
    for (const installment of defaulter.installments ?? []) {
      if (installment.status !== 'paid' && new Date(installment.dueDate) < today) {
        overdueTotal += (installment.amount ?? 0) - (installment.paidAmount ?? 0);
      }
    }
  }

  const collectedPct =
    totalAssigned > 0 ? Math.round((totalCollected / totalAssigned) * 1000) / 10 : null;

  return {
    totalAssigned,
    totalCollected,
    collectedPct,
    defaulterCount: defaulters.length,
    overdueTotal,
  };
}
