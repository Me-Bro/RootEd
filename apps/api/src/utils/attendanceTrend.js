function round1(n) {
  return Math.round(n * 10) / 10;
}

function toDateString(date) {
  return new Date(date).toISOString().slice(0, 10);
}

// Monday of the ISO week containing `date`, as a UTC date at midnight.
function mondayOf(date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay(); // 0 = Sun .. 6 = Sat
  const diff = (day === 0 ? -6 : 1) - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d;
}

/**
 * Turns per-day { date, presentCount, totalCount } rows into chart points —
 * one point per day for a 7-day window, or summed into weekly buckets for a
 * 30-day window (mirrors the dashboard's "30D" bar chart, 4 bars not 20).
 * `dailyStats` only ever contains days that had attendance marked, so there's
 * no zero-total day to special-case.
 */
export function bucketAttendanceTrend(dailyStats, days) {
  const sorted = [...dailyStats].sort((a, b) => new Date(a.date) - new Date(b.date));

  if (days <= 7) {
    return sorted.map((d) => ({
      date: toDateString(d.date),
      presentPct: d.totalCount > 0 ? round1((d.presentCount / d.totalCount) * 100) : null,
    }));
  }

  const weeks = new Map();
  for (const d of sorted) {
    const weekStart = toDateString(mondayOf(new Date(d.date)));
    const bucket = weeks.get(weekStart) ?? { presentCount: 0, totalCount: 0 };
    bucket.presentCount += d.presentCount;
    bucket.totalCount += d.totalCount;
    weeks.set(weekStart, bucket);
  }

  return [...weeks.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([weekStart, { presentCount, totalCount }]) => ({
      weekStart,
      presentPct: totalCount > 0 ? round1((presentCount / totalCount) * 100) : null,
    }));
}
