import { useState, useEffect } from 'react';

/**
 * A Date that re-renders its consumer on an interval.
 *
 * Time-derived UI (today's column, the current period's highlight) is computed
 * during render, so on a tab left open across a period boundary it stays frozen
 * at whatever the first render saw. Ticking a state value forces the
 * recalculation without a refetch.
 */
export function useNow(intervalMs = 60_000) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);

  return now;
}
