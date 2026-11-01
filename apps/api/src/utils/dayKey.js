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
