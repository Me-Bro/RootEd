/**
 * The subjects worth offering for a section: its class's subjects, plus subjects with
 * no class (school-wide ones such as PT). With no section chosen yet, everything.
 */
export function subjectsForSection(subjects, section) {
  if (!section) return subjects;
  return subjects.filter((s) => !s.classId || String(s.classId) === String(section.classId));
}
