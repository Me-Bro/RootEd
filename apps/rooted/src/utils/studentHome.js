const toMinutes = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

// Today's live and upcoming period from a student's /me/timetable. dayOfWeek is 1 (Mon)..5 (Fri),
// matching Date#getDay, so weekends match nothing.
export function currentAndNext(timetable, now = new Date()) {
  const mins = now.getHours() * 60 + now.getMinutes();
  const today = timetable
    .filter((e) => e.dayOfWeek === now.getDay() && e.startTime && e.endTime)
    .sort((a, b) => a.periodNumber - b.periodNumber);
  const current = today.find((e) => toMinutes(e.startTime) <= mins && mins < toMinutes(e.endTime));
  const next = today.find((e) => toMinutes(e.startTime) > mins);
  return {
    current: current ?? null,
    next: next ?? null,
    minutesLeft: current ? toMinutes(current.endTime) - mins : null,
    minutesToNext: next ? toMinutes(next.startTime) - mins : null,
    hasClassesToday: today.length > 0,
  };
}

const newestFirst = (records) => [...records].sort((a, b) => new Date(b.date) - new Date(a.date));

export function recentStrip(records, n = 7) {
  return newestFirst(records).slice(0, n);
}

export function absentRunRecords(records) {
  const run = [];
  for (const r of newestFirst(records)) {
    if (r.status !== 'absent') break;
    run.push(r);
  }
  return run;
}

export const absentRun = (records) => absentRunRecords(records).length;

// The next day after today with a period in the timetable, or null if it has none.
export function nextClassDay(timetable, now = new Date()) {
  for (let i = 1; i <= 7; i += 1) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    if (timetable.some((e) => e.dayOfWeek === d.getDay())) return d;
  }
  return null;
}
