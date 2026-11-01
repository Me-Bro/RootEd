import { bySeatLabel } from './seatAvailability.js';

/**
 * The seats a learner may be put on right now.
 *
 * Nobody may sit on a seat someone is on (an open visit). A walk-in's day pass
 * covers the whole day, so a walk-in may only use a seat that no member holds in any
 * shift: the day-pass pool. A member may use any seat that is free right now, with
 * the seats they hold themselves listed first, so a member who arrives in a
 * different shift than their own still gets their usual chair if it is free.
 */
export function freeSeatsFor({ seats, allocations, openVisits, student, ownSeatIds = [] }) {
  const occupied = new Set(openVisits.map((v) => String(v.seatId)));
  const heldAnywhere = new Set(allocations.map((a) => String(a.seatId)));
  const own = new Set(ownSeatIds.map(String));
  const walkIn = student.kind === 'walk_in';

  return seats
    .filter((s) => s.isActive !== false)
    .filter((s) => !occupied.has(String(s._id)))
    .filter((s) => !walkIn || !heldAnywhere.has(String(s._id)))
    .map((s) => ({
      seatId: s._id,
      label: s.label,
      zone: s.zone ?? null,
      own: own.has(String(s._id)),
    }))
    .sort((a, b) => Number(b.own) - Number(a.own) || bySeatLabel(a, b));
}
