// Small decisions the front-desk screen makes, kept pure so they can be tested.

// Whole minutes since `inAt`, never negative.
export function minutesSince(inAt, now = new Date()) {
  return Math.max(0, Math.round((new Date(now) - new Date(inAt)) / 60_000));
}

// Group seat tiles by zone, in first-seen order, with zoneless seats last.
export function groupByZone(tiles) {
  const groups = new Map();
  for (const tile of tiles) {
    const key = tile.zone ?? '';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(tile);
  }
  const named = [...groups.entries()].filter(([zone]) => zone !== '');
  const plain = groups.has('') ? [['', groups.get('')]] : [];
  return [...named, ...plain].map(([zone, seats]) => ({ zone: zone || null, seats }));
}

// What tapping a seat tile does, given the learner picked in the list (if any).
//  - an occupied seat offers check-out for whoever is on it;
//  - a free or held seat checks the picked learner in, when there is one who is not
//    already inside; otherwise it asks the desk to pick a learner first.
export function seatClickAction(tile, learner) {
  if (tile.state === 'occupied') return { type: 'checkOut', visitId: tile.occupant.visitId };
  if (!learner) return { type: 'pickLearner' };
  if (learner.inside) return { type: 'alreadyInside' };
  return { type: 'checkIn', studentId: learner._id, seatId: tile.seatId };
}

// Only an owner may close everyone at once; the server decides, this decides the button.
export const canCheckOutAll = (permissions = []) => permissions.includes('tenant:admin');

// A study-center user who works the desk (may check people in) but is not the owner
// lands on the front desk instead of a dashboard they have little use for.
export const landsOnDesk = ({ seats, permissions = [] }) =>
  Boolean(seats) &&
  permissions.includes('attendance:write') &&
  !permissions.includes('tenant:admin');
