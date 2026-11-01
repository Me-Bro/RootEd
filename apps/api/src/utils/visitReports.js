import { dayStringInTz } from './dayKey.js';

const PAID = new Set(['paid', 'waived']);

/** The next calendar month of "2026-05" ("2026-06"). */
export function nextMonth(month) {
  const [y, m] = month.split('-').map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
}

/**
 * Time on seat per learner for visits that began in [from, to). A visit still open
 * counts up to `now`. Minutes are whole minutes, rounded. Longest first.
 */
export function hoursPerLearner({ visits, from, to, now }) {
  const byStudent = new Map();
  for (const v of visits) {
    const inAt = new Date(v.inAt);
    if (inAt < from || inAt >= to) continue;
    const end = v.outAt ? new Date(v.outAt) : now;
    const row = byStudent.get(String(v.studentId)) ?? {
      studentId: v.studentId,
      minutes: 0,
      visits: 0,
      autoClosedVisits: 0,
    };
    row.minutes += Math.max(0, Math.round((end - inAt) / 60_000));
    row.visits += 1;
    if (v.autoClosed) row.autoClosedVisits += 1;
    byStudent.set(String(v.studentId), row);
  }
  return [...byStudent.values()].sort((a, b) => b.minutes - a.minutes);
}

/**
 * Seats held versus seats occupied right now.
 *  held        seats a member holds in at least one shift
 *  occupiedNow open visits
 *  poolSeats   active seats nobody holds in any shift (what a day pass can use)
 *  poolFree    pool seats nobody is on right now
 *  shifts      per shift: seats held, and how many of those holders are inside now
 */
export function occupancy({ seats, allocations, openVisits, sections }) {
  const active = seats.filter((s) => s.isActive !== false);
  const activeIds = new Set(active.map((s) => String(s._id)));
  const holds = allocations.filter((a) => activeIds.has(String(a.seatId)));
  const heldIds = new Set(holds.map((a) => String(a.seatId)));
  const occupied = new Set(openVisits.map((v) => String(v.seatId)));
  const inside = new Set(openVisits.map((v) => String(v.studentId)));

  const pool = active.filter((s) => !heldIds.has(String(s._id)));
  return {
    seatsActive: active.length,
    held: heldIds.size,
    occupiedNow: openVisits.length,
    poolSeats: pool.length,
    poolFree: pool.filter((s) => !occupied.has(String(s._id))).length,
    shifts: sections.map((section) => {
      const mine = holds.filter((a) => String(a.sectionId) === String(section._id));
      return {
        sectionId: section._id,
        name: section.name,
        heldSeats: new Set(mine.map((a) => String(a.seatId))).size,
        checkedInNow: mine.filter((a) => inside.has(String(a.studentId))).length,
      };
    }),
  };
}

/**
 * Members who had a paid plan covering the day and never came in. `members` are the
 * learners to consider (walk-ins excluded by the caller); `dayStart` and `dayEnd` are
 * the day's bounds on the centre's clock.
 */
export function noShows({ members, assignments, visits, dayStart, dayEnd }) {
  const came = new Set(
    visits
      .filter((v) => new Date(v.inAt) >= dayStart && new Date(v.inAt) <= dayEnd)
      .map((v) => String(v.studentId))
  );
  const rows = [];
  for (const member of members) {
    const covering = assignments.filter(
      (a) =>
        String(a.studentId) === String(member._id) &&
        PAID.has(a.status) &&
        a.coversFrom &&
        a.coversTo &&
        new Date(a.coversFrom) <= dayEnd &&
        new Date(a.coversTo) >= dayStart
    );
    if (!covering.length || came.has(String(member._id))) continue;
    rows.push({
      studentId: member._id,
      coversTo: new Date(Math.max(...covering.map((a) => new Date(a.coversTo).getTime()))),
    });
  }
  return rows;
}

/** Day pass payments grouped by day on the centre's clock: { day, count, revenue }. */
export function groupSalesByDay({ payments, timezone }) {
  const days = new Map();
  for (const p of payments) {
    if (p.refunded) continue;
    const day = dayStringInTz(new Date(p.paymentDate), timezone);
    const row = days.get(day) ?? { day, count: 0, revenue: 0 };
    row.count += 1;
    row.revenue += p.amount;
    days.set(day, row);
  }
  return [...days.values()].sort((a, b) => a.day.localeCompare(b.day));
}
