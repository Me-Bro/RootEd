const toMinutes = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

// Today's live and upcoming period from a student's /me/timetable. dayOfWeek is 1 (Mon)..5 (Fri),
// matching Date#getDay, so weekends match nothing.
export function todayPeriods(timetable, now = new Date()) {
  return timetable
    .filter((e) => e.dayOfWeek === now.getDay() && e.startTime && e.endTime)
    .sort((a, b) => a.periodNumber - b.periodNumber);
}

export function currentAndNext(timetable, now = new Date()) {
  const mins = now.getHours() * 60 + now.getMinutes();
  const today = todayPeriods(timetable, now);
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

// True once a period has finished today.
export const periodEnded = (entry, now = new Date()) =>
  toMinutes(entry.endTime) <= now.getHours() * 60 + now.getMinutes();

// This calendar month's attendance: counts, % attended (present or late), and the dates
// of the late and absent days, newest first. pct is null when no day is marked.
export function monthSummary(records, now = new Date()) {
  const inMonth = records.filter((r) => {
    const d = new Date(r.date);
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  });
  const count = (status) => inMonth.filter((r) => r.status === status).length;
  const dates = (status) =>
    newestFirst(inMonth.filter((r) => r.status === status)).map((r) => r.date);
  const present = count('present');
  const late = count('late');
  return {
    days: inMonth.length,
    present,
    late,
    absent: count('absent'),
    pct: inMonth.length ? Math.round(((present + late) / inMonth.length) * 100) : null,
    absentDates: dates('absent'),
    lateDates: dates('late'),
  };
}

const publishedOf = (g) => new Date(g.publishedAt ?? g.updatedAt ?? 0);

// Published grades with a score, newest published first.
export function latestGrades(grades) {
  return grades
    .filter((g) => typeof g.score === 'number')
    .sort((a, b) => publishedOf(b) - publishedOf(a));
}

export const subjectGrades = (grades, subjectId) =>
  latestGrades(grades).filter((g) => String(g.subjectId) === String(subjectId));

export const gradedSubjectIds = (grades) =>
  new Set(latestGrades(grades).map((g) => String(g.subjectId)));

// Whole calendar days from today to date (negative once past).
export function daysUntil(date, now = new Date()) {
  const day = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate());
  return Math.round((day(new Date(date)) - day(now)) / 86_400_000);
}
