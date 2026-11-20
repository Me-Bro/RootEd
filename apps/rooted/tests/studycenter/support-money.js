// Shared by the money specs: the centre's calendar is IST (the tenant default), and the
// app writes months as "Nov 2026", so the specs build the same strings from the same clock.
const IST_SHIFT_MS = 5.5 * 60 * 60 * 1000;

/** The `back`-th month before this one on the centre's calendar, as { key, label }. */
export function monthAgo(back = 0) {
  const ist = new Date(Date.now() + IST_SHIFT_MS);
  const d = new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth() - back, 1));
  return {
    key: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`,
    label: d.toLocaleDateString('en-IN', { month: 'short', year: 'numeric', timeZone: 'UTC' }),
  };
}
