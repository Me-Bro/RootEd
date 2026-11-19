import { bySeatLabel } from './seatAvailability.js';

// Pure pieces of the front-desk payload (services/desk.service.js loads the data).

const minutesBetween = (from, to) => Math.max(0, Math.round((to - new Date(from)) / 60_000));

/**
 * One tile per active seat, live: `occupied` when someone is on it right now (whoever
 * they are), else `held` when a member holds it in some shift but is not on it, else
 * `free`. `pool` is true when no member holds it in any shift (what a day pass may use).
 * `holder` is the earliest standing hold; `names` maps student id to a display name.
 */
export function buildSeatTiles({ seats, allocations, openVisits, names }) {
  const onSeat = new Map(openVisits.map((v) => [String(v.seatId), v]));
  const holdBySeat = new Map();
  [...allocations]
    .sort((a, b) => new Date(a.startDate ?? 0) - new Date(b.startDate ?? 0))
    .forEach((a) => {
      if (!holdBySeat.has(String(a.seatId))) holdBySeat.set(String(a.seatId), a);
    });

  return seats
    .filter((s) => s.isActive !== false)
    .map((s) => {
      const key = String(s._id);
      const visit = onSeat.get(key);
      const hold = holdBySeat.get(key);
      const tile = {
        seatId: s._id,
        label: s.label,
        zone: s.zone ?? null,
        state: visit ? 'occupied' : hold ? 'held' : 'free',
        pool: !hold,
      };
      if (visit) {
        tile.occupant = {
          studentId: visit.studentId,
          name: names.get(String(visit.studentId)) ?? null,
          since: visit.inAt,
          visitId: visit._id,
        };
      }
      if (hold) {
        tile.holder = {
          studentId: hold.studentId,
          name: names.get(String(hold.studentId)) ?? null,
        };
      }
      return tile;
    })
    .sort(bySeatLabel);
}

/** The strip at the top of the desk. A held seat nobody is on still counts as free. */
export function buildSummary({ tiles, openCount, checkInsToday, open, centre }) {
  return {
    insideNow: openCount,
    seatsActive: tiles.length,
    freeSeats: tiles.filter((t) => t.state !== 'occupied').length,
    checkInsToday,
    openNow: open,
    openTime: centre.openTime,
    closeTime: centre.closeTime,
    open24h: centre.open24h,
  };
}

/**
 * Narrow the learner list. `warning` keeps learners whose plan is not valid; a learner
 * with no entitlement figure (the viewer cannot see fees) is never a warning.
 */
export function filterLearners(learners, filter = 'all') {
  switch (filter) {
    case 'inside':
      return learners.filter((l) => l.inside);
    case 'notInside':
      return learners.filter((l) => !l.inside);
    case 'warning':
      return learners.filter((l) => l.entitlement && l.entitlement.status !== 'valid');
    default:
      return learners;
  }
}

/** Today's check-ins and check-outs, newest event first; an open visit counts to `now`. */
export function buildActivity({ visits, names, seatLabels, now, limit = 50 }) {
  const lastEvent = (v) => new Date(v.outAt ?? v.inAt).getTime();
  return [...visits]
    .sort((a, b) => lastEvent(b) - lastEvent(a))
    .slice(0, limit)
    .map((v) => ({
      visitId: v._id,
      name: names.get(String(v.studentId)) ?? null,
      seatLabel: seatLabels.get(String(v.seatId)) ?? null,
      inAt: v.inAt,
      outAt: v.outAt ?? null,
      minutes: minutesBetween(v.inAt, v.outAt ? new Date(v.outAt) : now),
      autoClosed: Boolean(v.autoClosed),
      bulkClosed: Boolean(v.bulkClosed),
    }));
}
