import { calculateEffectiveTotal } from './feeCalculations.js';
import { dayStringInTz } from './dayKey.js';
import { nextMonth } from './visitReports.js';

/**
 * A study center's money, as pure functions over already-fetched rows: what it spent
 * in a month, what it collected, and what learners still owe (per learner and per
 * month). Nothing here reads the database or the clock, so every rule is testable.
 *
 * Months are 'YYYY-MM' on the centre's own calendar. An expense holds its day as a
 * UTC-midnight Date (a day key), so its month is read in UTC; a payment is a real
 * instant, so its month is read in the centre's timezone.
 */

const round2 = (x) => Math.round(x * 100) / 100;

const monthOfDayKey = (date) => new Date(date).toISOString().slice(0, 7);

/** The month before "2026-05" ("2026-04"). */
export function previousMonth(month) {
  const [y, m] = month.split('-').map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
}

/** The `count` months ending at `month`, oldest first. */
export function lastMonths(month, count) {
  const months = [month];
  while (months.length < count) months.unshift(previousMonth(months[0]));
  return months;
}

/** First day of `month` and of the month after it, as day strings (half-open range). */
export function monthDayBounds(month) {
  return { from: `${month}-01`, to: `${nextMonth(month)}-01` };
}

// ── Expenses ────────────────────────────────────────────────────────────────

// A rejected or draft entry was never spent; approved and paid ones were.
const COUNTS_AS_SPENT = new Set(['approved', 'paid']);

/** Total, count and per-category split (largest first) of one month's expenses. */
export function summarizeExpenses(entries, month) {
  const byCategory = new Map();
  let total = 0;
  let count = 0;
  for (const e of entries) {
    if (!COUNTS_AS_SPENT.has(e.status) || monthOfDayKey(e.invoiceDate) !== month) continue;
    total += e.amount;
    count += 1;
    const row = byCategory.get(e.category) ?? { category: e.category, total: 0, count: 0 };
    row.total += e.amount;
    row.count += 1;
    byCategory.set(e.category, row);
  }
  const categories = [...byCategory.values()]
    .map((r) => ({ ...r, total: round2(r.total) }))
    .sort((a, b) => b.total - a.total || a.category.localeCompare(b.category));
  return { month, total: round2(total), count, categories };
}

/** Spent per month, for each month in `months` (zero where nothing was spent). */
export function expenseTrend(entries, months) {
  const totals = new Map(months.map((m) => [m, 0]));
  for (const e of entries) {
    if (!COUNTS_AS_SPENT.has(e.status)) continue;
    const m = monthOfDayKey(e.invoiceDate);
    if (totals.has(m)) totals.set(m, totals.get(m) + e.amount);
  }
  return months.map((month) => ({ month, total: round2(totals.get(month)) }));
}

// ── Collection ──────────────────────────────────────────────────────────────

// A refunded payment is not money the centre kept, so it leaves the month it was
// taken in (not the month it was refunded in).
const keptPayments = (payments) => payments.filter((p) => !p.refunded);

const paymentMonth = (payment, timezone) =>
  dayStringInTz(new Date(payment.paymentDate), timezone).slice(0, 7);

/** Total, count and per-method split of what was collected in one month. */
export function summarizeCollection(payments, month, timezone) {
  const byMethod = new Map();
  let total = 0;
  let count = 0;
  for (const p of keptPayments(payments)) {
    if (paymentMonth(p, timezone) !== month) continue;
    total += p.amount;
    count += 1;
    const row = byMethod.get(p.paymentMethod) ?? { method: p.paymentMethod, total: 0, count: 0 };
    row.total += p.amount;
    row.count += 1;
    byMethod.set(p.paymentMethod, row);
  }
  const methods = [...byMethod.values()]
    .map((r) => ({ ...r, total: round2(r.total) }))
    .sort((a, b) => b.total - a.total || a.method.localeCompare(b.method));
  return { month, total: round2(total), count, methods };
}

/** Collected per month, for each month in `months`. */
export function collectionTrend(payments, months, timezone) {
  const totals = new Map(months.map((m) => [m, 0]));
  for (const p of keptPayments(payments)) {
    const m = paymentMonth(p, timezone);
    if (totals.has(m)) totals.set(m, totals.get(m) + p.amount);
  }
  return months.map((month) => ({ month, total: round2(totals.get(month)) }));
}

// ── Pending fees ────────────────────────────────────────────────────────────

/**
 * What one fee assignment contributes to the pending reports, as "items": one per
 * billing cycle for a cycle plan, one for any other (one-off) assignment. `a` is an
 * assignment with its balances (`withBalances(..., { cycles: true })`).
 *
 *   month   - the month the amount falls due in (a cycle falls due on its last day)
 *   phase   - 'closed' once due (so what is left is overdue), else 'current'
 *   billed / paid / pending - pending is what is still unpaid on that item
 *
 * A plan's payments settle its oldest cycle first (see buildLedger), so a cycle's
 * `paid` is where the money was put, not the day it was taken. A waived assignment
 * owes nothing and has no items.
 */
export function pendingItems(a, { today, timezone }) {
  if (a.status === 'waived') return [];

  if (a.ledger) {
    return (a.ledger.cycles ?? []).map((c) => ({
      studentId: a.studentId,
      assignmentId: a._id,
      kind: 'plan',
      month: c.dueOn.slice(0, 7),
      dueOn: c.dueOn,
      phase: c.phase,
      billed: c.net,
      paid: c.paid,
      pending: Math.max(c.net - c.paid, 0),
    }));
  }

  const billed = calculateEffectiveTotal(a);
  const paid = a.paidAmount ?? 0;
  const anchor = a.dueDate ?? a.coversFrom ?? a.createdAt;
  const dueOn = dayStringInTz(new Date(anchor), timezone);
  return [
    {
      studentId: a.studentId,
      assignmentId: a._id,
      kind: 'oneOff',
      month: dueOn.slice(0, 7),
      dueOn,
      phase: a.dueDate && dueOn < today ? 'closed' : 'current',
      billed,
      paid,
      pending: Math.max(a.balanceDue ?? billed - paid, 0),
    },
  ];
}

/**
 * One row per learner who owes something: what is overdue, what is on the current
 * cycle, the oldest month with an unpaid balance, and when it fell due.
 * Largest balance first.
 */
export function pendingByStudent(items) {
  const rows = new Map();
  for (const item of items) {
    if (item.pending <= 0) continue;
    const key = String(item.studentId);
    const row = rows.get(key) ?? {
      studentId: item.studentId,
      overdue: 0,
      current: 0,
      pending: 0,
      oldestMonth: null,
      oldestDueOn: null,
    };
    if (item.phase === 'closed') row.overdue += item.pending;
    else row.current += item.pending;
    row.pending += item.pending;
    if (!row.oldestDueOn || item.dueOn < row.oldestDueOn) {
      row.oldestDueOn = item.dueOn;
      row.oldestMonth = item.month;
    }
    rows.set(key, row);
  }
  return [...rows.values()]
    .map((r) => ({
      ...r,
      overdue: round2(r.overdue),
      current: round2(r.current),
      pending: round2(r.pending),
    }))
    .sort(
      (a, b) => b.pending - a.pending || String(a.studentId).localeCompare(String(b.studentId))
    );
}

/**
 * One row per month with anything billed: billed, paid against it, still pending,
 * the learners who owe, and whether the month is over ('closed') or still running.
 * Newest first.
 */
export function pendingByMonth(items, { today }) {
  const rows = new Map();
  for (const item of items) {
    const row = rows.get(item.month) ?? {
      month: item.month,
      billed: 0,
      paid: 0,
      pending: 0,
      learners: new Set(),
    };
    row.billed += item.billed;
    row.paid += item.paid;
    row.pending += item.pending;
    if (item.pending > 0) row.learners.add(String(item.studentId));
    rows.set(item.month, row);
  }
  const thisMonth = today.slice(0, 7);
  return [...rows.values()]
    .map(({ learners, ...r }) => ({
      ...r,
      billed: round2(r.billed),
      paid: round2(r.paid),
      pending: round2(r.pending),
      learnersOwing: learners.size,
      status: r.month < thisMonth ? 'closed' : 'running',
    }))
    .sort((a, b) => b.month.localeCompare(a.month));
}

/** Everything still owed: the total, and how much of it is overdue. */
export function pendingTotals(items) {
  let pending = 0;
  let overdue = 0;
  const learners = new Set();
  for (const item of items) {
    if (item.pending <= 0) continue;
    pending += item.pending;
    if (item.phase === 'closed') overdue += item.pending;
    learners.add(String(item.studentId));
  }
  return { pending: round2(pending), overdue: round2(overdue), learnersOwing: learners.size };
}
