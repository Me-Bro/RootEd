import { MAX_BACKDATE_DAYS } from '@rooted/shared/schemas';
import { calculateDiscountAmount } from './feeCalculations.js';
import { pickStandingDiscount } from './discountPolicy.js';

/**
 * Study-center cycle billing, computed on read. Nothing here touches the database.
 *
 * A learner's billing timeline lives on their fee assignment as
 *   billing: { segments: [{ feeStructureId, cycle, amount, from, to? }],
 *              pauses: [{ from, to? }], endedOn? }
 * Every date is a calendar day of the centre, stored as a UTC-midnight Date (the
 * dayKey.js convention). Ranges are half-open: `from` is the first billable day and
 * `to` / a pause's `to` / `endedOn` the first day that is not billed, so no +1/-1
 * appears anywhere below. Internally a day is an integer: days since 1970-01-01.
 *
 * Cycles are calendar-aligned (a month, or a Monday-to-Sunday week). A cycle is
 * charged amount x active days / days in the cycle, so a mid-month join, a pause and
 * a withdrawal all prorate the same way. It falls due on its last day and is overdue
 * from the day after. Payments settle the oldest cycle first.
 */

const MS_PER_DAY = 86_400_000;

const toDayNumber = (value) => {
  if (value === null || value === undefined) return null;
  const date = typeof value === 'string' ? new Date(`${value}T00:00:00Z`) : new Date(value);
  return Math.floor(date.getTime() / MS_PER_DAY);
};
const toDayString = (n) => new Date(n * MS_PER_DAY).toISOString().slice(0, 10);
const toDayDate = (n) => new Date(n * MS_PER_DAY);

function cycleStartOf(cycle, n) {
  const date = toDayDate(n);
  if (cycle === 'weekly') return n - ((date.getUTCDay() + 6) % 7); // back to Monday
  return toDayNumber(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function nextCycleStart(cycle, start) {
  if (cycle === 'weekly') return start + 7;
  const date = toDayDate(start);
  return toDayNumber(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
}

function* cycleRanges(cycle, from, through) {
  for (let start = cycleStartOf(cycle, from); start <= through; ) {
    const end = nextCycleStart(cycle, start);
    yield { start, end };
    start = end;
  }
}

/** Calendar cycles that overlap the days fromDay..toDay (both included). */
export function cyclesBetween({ cycle, fromDay, toDay }) {
  return [...cycleRanges(cycle, toDayNumber(fromDay), toDayNumber(toDay))].map(
    ({ start, end }) => ({ start: toDayString(start), end: toDayString(end) })
  );
}

const inRange = (n, from, to) => n >= from && (to === null || n < to);

const roundRupee = (x) => Math.round(x);

function emptyLedger(state) {
  return { state, cycles: [], overdue: 0, current: 0, credit: 0, payableNow: 0, nextDue: null };
}

function stateOf({ segments, pauses, endedOn, today }) {
  if (endedOn !== null && today >= endedOn) return 'ended';
  if (today < segments[0].from) return 'scheduled';
  if (pauses.some((p) => inRange(today, p.from, p.to))) return 'paused';
  return 'active';
}

/**
 * The learner's ledger on `today` (the centre's day, YYYY-MM-DD): one row per cycle
 * up to and including the cycle that contains today, and the balances.
 *   overdue    - unpaid net of closed cycles
 *   current    - net of the current cycle as things stand (an open pause stays open)
 *   credit     - payments beyond every closed and current cycle
 *   payableNow - most that may be paid today: overdue plus what is left of the
 *                current cycle
 *   nextDue    - the oldest cycle with something left to pay
 */
export function buildLedger({ billing, discounts = [], payments = [], today, studentId }) {
  if (!billing?.segments?.length) return emptyLedger('none');

  const todayN = toDayNumber(today);
  const segments = billing.segments
    .map((s) => ({ ...s, from: toDayNumber(s.from), to: toDayNumber(s.to) }))
    .sort((a, b) => a.from - b.from);
  const pauses = (billing.pauses ?? []).map((p) => ({
    from: toDayNumber(p.from),
    to: toDayNumber(p.to),
  }));
  const endedOn = toDayNumber(billing.endedOn);
  const state = stateOf({ segments, pauses, endedOn, today: todayN });

  const isBillable = (n, segment) =>
    inRange(n, segment.from, segment.to) &&
    (endedOn === null || n < endedOn) &&
    !pauses.some((p) => inRange(n, p.from, p.to));

  const rows = [];
  for (const segment of segments) {
    for (const { start, end } of cycleRanges(segment.cycle, segment.from, todayN)) {
      let activeDays = 0;
      let firstActive = null;
      for (let n = start; n < end; n++) {
        if (!isBillable(n, segment)) continue;
        activeDays++;
        if (firstActive === null) firstActive = n;
      }
      if (activeDays === 0) continue;

      const daysInCycle = end - start;
      const ratio = activeDays / daysInCycle;
      const charge = roundRupee(segment.amount * ratio);
      // The learner's own discount valid on the first billed day of the cycle, scaled
      // like the charge (a flat amount off a full month becomes a part of it).
      const standing = pickStandingDiscount({
        discounts,
        studentId,
        at: toDayDate(firstActive),
        baseAmount: segment.amount,
      });
      const discount = standing
        ? Math.min(
            roundRupee(
              calculateDiscountAmount({
                type: standing.type,
                value: standing.value,
                baseAmount: segment.amount,
              }) * ratio
            ),
            charge
          )
        : 0;

      rows.push({
        feeStructureId: segment.feeStructureId,
        cycle: segment.cycle,
        start: toDayString(start),
        end: toDayString(end),
        dueOn: toDayString(end - 1),
        daysInCycle,
        activeDays,
        charge,
        discount,
        net: charge - discount,
        phase: todayN >= end ? 'closed' : 'current',
        startN: start,
      });
    }
  }
  rows.sort((a, b) => a.startN - b.startN);

  let unallocated = payments
    .filter((p) => !p.refunded)
    .reduce((sum, p) => sum + (p.amount || 0), 0);
  let overdue = 0;
  let current = 0;
  let currentLeft = 0;
  let nextDue = null;
  const cycles = rows.map(({ startN: _startN, ...row }) => {
    const paid = Math.min(unallocated, row.net);
    unallocated -= paid;
    const left = row.net - paid;
    if (row.phase === 'closed') overdue += left;
    else {
      current += row.net;
      currentLeft += left;
    }
    if (left > 0 && !nextDue) nextDue = { amount: left, dueOn: row.dueOn };
    const status = left === 0 ? 'paid' : paid > 0 ? 'partial' : 'unpaid';
    return { ...row, paid, status };
  });

  // The amount still owed on the oldest unpaid cycle is reported together with any
  // later closed cycle: everything overdue is due now.
  if (nextDue && overdue > 0) nextDue = { ...nextDue, amount: overdue };

  return {
    state,
    cycles,
    overdue,
    current,
    credit: unallocated,
    payableNow: overdue + currentLeft,
    nextDue,
  };
}

/** Whether a learner on cycle billing may use the centre, from their ledger. */
export function billingEntitlement(ledger) {
  if (['none', 'ended', 'scheduled', 'paused'].includes(ledger.state)) return ledger.state;
  return ledger.overdue > 0 ? 'unpaid' : 'valid';
}

/** null when the start day is allowed, else an error code. Future days are allowed. */
export function validateStartDay({ startDay, today }) {
  return toDayNumber(today) - toDayNumber(startDay) > MAX_BACKDATE_DAYS ? 'too_far_back' : null;
}
