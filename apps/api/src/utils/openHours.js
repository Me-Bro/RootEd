import { addDaysToDayString, dayStringInTz, zonedMidnight } from './dayKey.js';

// "HH:mm" on the clock of the timezone, for an instant.
export function localHHmm(instant, timezone = 'Asia/Kolkata') {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(instant);
}

/** Is the centre open at `now`? `centre` is the resolved centre settings. */
export function isWithinOpenHours(now, centre, timezone) {
  if (centre.open24h) return true;
  const time = localHHmm(now, timezone);
  return time >= centre.openTime && time < centre.closeTime;
}

const minutes = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/** The instant the centre closes on a calendar day ("2026-05-11") in its timezone. */
export function closeInstantFor(dayString, centre, timezone) {
  return new Date(
    zonedMidnight(dayString, timezone).getTime() + minutes(centre.closeTime) * 60_000
  );
}

/**
 * When a visit that began at `inAt` is due to be closed automatically. Normally the
 * closing time of the day it began. A visit begun after that (an owner letting
 * someone in late) runs to the next day's closing time, never longer than
 * `maxVisitMs`. A 24-hour centre only has the cap.
 */
export function autoCloseAt(inAt, centre, timezone, maxVisitMs) {
  const cap = new Date(inAt.getTime() + maxVisitMs);
  if (centre.open24h) return cap;
  const day = dayStringInTz(inAt, timezone);
  let close = closeInstantFor(day, centre, timezone);
  if (close < inAt) close = closeInstantFor(addDaysToDayString(day, 1), centre, timezone);
  return close < cap ? close : cap;
}
