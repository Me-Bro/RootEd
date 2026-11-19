// Do two study-center shifts (batches) share any part of the day? Pure, no DB.
//
// A shift's hours are optional "HH:mm" strings. A missing start means the shift
// begins at midnight and a missing end means it runs to the end of the day, so a
// shift with no hours at all is all-day and overlaps every other shift.
const DAY_MINUTES = 24 * 60;

const toMinutes = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/** `{ start, end }` in minutes since midnight, half-open: `end` is the first minute not covered. */
export function shiftWindow({ startTime, endTime } = {}) {
  return {
    start: startTime ? toMinutes(startTime) : 0,
    end: endTime ? toMinutes(endTime) : DAY_MINUTES,
  };
}

/**
 * True when the two shifts overlap. Half-open ranges, so a shift that ends at 12:00
 * and one that starts at 12:00 are adjacent, not overlapping.
 */
export function shiftsOverlap(a, b) {
  const x = shiftWindow(a);
  const y = shiftWindow(b);
  return x.start < y.end && y.start < x.end;
}
