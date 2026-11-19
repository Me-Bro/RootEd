// A length of time in whole minutes, as "2h 30m", "2h", "45m". Not a date, so it
// is not formatted through the date helpers. Anything that is not a number is a dash.
export function formatDuration(minutes) {
  if (typeof minutes !== 'number' || !Number.isFinite(minutes) || minutes < 0) return '—';
  const total = Math.round(minutes);
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}
