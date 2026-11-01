// Natural order for seat labels, so A-2 comes before A-10.
export const bySeatLabel = (a, b) =>
  String(a.label).localeCompare(String(b.label), undefined, { numeric: true, sensitivity: 'base' });

/**
 * Which seats are held in one shift, and how many are free for day passes.
 *
 * `shiftAllocations` are the active holds in the chosen shift; `anyAllocations`
 * are the active holds in every shift. A seat is in the day-pass pool when nobody
 * holds it in any shift: a day pass covers the whole day, so a seat shared by a
 * Morning and an Evening member is closed to it even when its holders are away.
 *
 * `holderName(studentId)` is passed in so this stays a pure function.
 */
export function buildAvailability({ seats, shiftAllocations, anyAllocations, holderName }) {
  const heldInShift = new Map(shiftAllocations.map((a) => [String(a.seatId), a]));
  const heldAnywhere = new Set(anyAllocations.map((a) => String(a.seatId)));

  const active = seats.filter((s) => s.isActive !== false).sort(bySeatLabel);
  const items = active.map((seat) => {
    const hold = heldInShift.get(String(seat._id));
    return {
      seatId: seat._id,
      label: seat.label,
      zone: seat.zone ?? null,
      heldBy: hold
        ? { allocationId: hold._id, studentId: hold.studentId, name: holderName(hold.studentId) }
        : null,
    };
  });

  return {
    items,
    heldCount: items.filter((i) => i.heldBy).length,
    poolSize: active.filter((s) => !heldAnywhere.has(String(s._id))).length,
  };
}

/** "A-", 6, start 1 -> A-1 .. A-6. */
export function bulkLabels({ prefix = '', count, start = 1 }) {
  return Array.from({ length: count }, (_, i) => `${prefix}${start + i}`);
}
