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
