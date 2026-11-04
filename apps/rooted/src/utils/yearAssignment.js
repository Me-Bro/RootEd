/**
 * Who teaches a subject in a section for the academic year. Assignments are per year
 * but stored one row per term, so the year's teacher is the one found in any of its
 * terms, preferring the latest. `termIds` are the year's terms in date order; rows from
 * other terms are ignored. Returns the teacher and every row to remove when clearing, or
 * null when nobody is assigned.
 */
export function yearAssignment(rows, sectionId, termIds) {
  const mine = rows.filter((r) => r.sectionId === sectionId && termIds.includes(r.termId));
  if (!mine.length) return null;
  const latest = mine.reduce((a, b) =>
    termIds.indexOf(b.termId) > termIds.indexOf(a.termId) ? b : a
  );
  return { teacherId: latest.teacherId, rows: mine };
}

/** The sections a subject is taught in: its class's, or every section for a classless subject. */
export function sectionsForSubject(subject, sections) {
  if (!subject.classId) return sections;
  return sections.filter((s) => String(s.classId) === String(subject.classId));
}

// The directory's name wins; the account's own name, then its email, only cover a teacher
// who was never added as staff.
function nameOf(id, user, nameById) {
  const fromAccount = [user?.firstName, user?.lastName].filter(Boolean).join(' ') || user?.email;
  return nameById.get(id) || fromAccount || '';
}

/**
 * Who teaches a subject this academic year, across all its sections, as names. Each
 * section's teacher is read the way the Teachers dialog reads it (the latest term of the
 * year wins), then people are listed once, sorted. `rows` are GET /academic/subject-teachers
 * rows; `nameById` is useTeachers().nameById (user id to staff name). An assignment whose
 * teacher can be named by neither is skipped.
 */
export function teacherNamesOfSubject(rows, subjectId, termIds, nameById) {
  const latest = new Map();
  for (const r of rows) {
    if (r.subjectId !== subjectId || !termIds.includes(r.termId)) continue;
    const current = latest.get(r.sectionId);
    if (!current || termIds.indexOf(r.termId) > termIds.indexOf(current.termId)) {
      latest.set(r.sectionId, r);
    }
  }
  const names = new Map();
  for (const r of latest.values()) {
    const name = nameOf(r.teacherId, r.teacher, nameById);
    if (r.teacherId && name && !names.has(r.teacherId)) names.set(r.teacherId, name);
  }
  return [...names.values()].sort((a, b) => a.localeCompare(b));
}

/** The first `max` names to show, and how many more there are. */
export function teacherSummary(names, max = 2) {
  return { names: names.slice(0, max), more: Math.max(0, names.length - max) };
}
