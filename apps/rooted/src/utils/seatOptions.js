// What a learner's page offers when giving, moving or ending a seat. The server decides
// every rule (one holder per seat and shift, no clash between overlapping shifts, the
// learner enrolled in the shift); these only keep the choices to ones that can work.

/** Seats of a shift that nobody holds and no overlapping shift has taken. */
export const freeSeats = (items = []) => items.filter((i) => !i.heldBy && !i.blockedBy);

const idOf = (v) => String(v?._id ?? v);

/** Shifts the learner has no seat in yet (a learner holds one seat per shift). */
export const shiftsToOffer = (sections = [], allocations = []) =>
  sections.filter((s) => !allocations.some((a) => idOf(a.sectionId) === String(s._id)));

/** "A-1 · Hall 1" or just "A-1". */
export const seatOptionLabel = (seat) => (seat.zone ? `${seat.label} · ${seat.zone}` : seat.label);
