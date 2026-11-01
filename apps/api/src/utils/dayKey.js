// The calendar day of an instant in the tenant's timezone, as the key the rest of
// the code already uses for "a day": a UTC-midnight Date built from the
// YYYY-MM-DD string (what z.coerce.date() makes of a date-only string). Never
// derive this from the client — the web pages send the UTC date, which is
// yesterday for the first 5.5 hours of an IST day.
export function dayStringInTz(instant, timezone = 'Asia/Kolkata') {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant);
}

export function dayKeyInTz(instant, timezone = 'Asia/Kolkata') {
  return new Date(dayStringInTz(instant, timezone));
}

// Milliseconds the timezone is ahead of UTC at `instant` (IST: +19_800_000).
function offsetMs(instant, timezone) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
      .formatToParts(instant)
      .map((p) => [p.type, p.value])
  );
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second)
  );
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/** The instant a calendar day ("2026-05-11") begins in the timezone. */
export function zonedMidnight(dayString, timezone = 'Asia/Kolkata') {
  const [y, m, d] = dayString.split('-').map(Number);
  const guess = Date.UTC(y, m - 1, d);
  // Two passes: the offset at the guess can differ from the offset at midnight
  // itself on a day the clocks change.
  let instant = guess - offsetMs(new Date(guess), timezone);
  instant = guess - offsetMs(new Date(instant), timezone);
  return new Date(instant);
}

/** "2026-05-11" plus n days, as a string. */
export function addDaysToDayString(dayString, n) {
  const [y, m, d] = dayString.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
