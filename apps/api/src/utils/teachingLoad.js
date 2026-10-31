/**
 * Which sections and subjects a teacher covers, merged from the three places the
 * system records it: assignments (SubjectTeacher), timetable slots, and being a
 * section's class teacher.
 *
 * One row per (section, subject). `sources` says where the row came from, and
 * `periodsPerWeek` counts the timetable slots. A class-teacher section gets a row
 * with no subject, so a class teacher can open their own form even with no
 * subject assigned. Ids that no longer resolve (a deleted subject or section) are
 * dropped.
 */
export function buildTeachingLoad({
  assignments,
  slots,
  classTeacherSectionIds,
  sections,
  classes,
  subjects,
}) {
  const sectionById = new Map(sections.map((s) => [String(s._id), s]));
  const classById = new Map(classes.map((c) => [String(c._id), c]));
  const subjectById = new Map(subjects.map((s) => [String(s._id), s]));

  const rows = new Map();
  const touch = (sectionId, subjectId, source) => {
    const section = sectionById.get(String(sectionId));
    const subject = subjectId ? subjectById.get(String(subjectId)) : null;
    if (!section || (subjectId && !subject)) return null;

    const key = `${section._id}:${subject?._id ?? ''}`;
    let row = rows.get(key);
    if (!row) {
      const cls = classById.get(String(section.classId));
      row = {
        sectionId: String(section._id),
        classId: String(section.classId),
        sectionLabel: `${cls?.name ?? ''} - ${section.name}`,
        subjectId: subject ? String(subject._id) : null,
        subjectName: subject?.name ?? null,
        sources: [],
        periodsPerWeek: 0,
        gradeLevel: cls?.gradeLevel ?? 0,
        sectionName: section.name,
      };
      rows.set(key, row);
    }
    if (!row.sources.includes(source)) row.sources.push(source);
    return row;
  };

  for (const a of assignments) touch(a.sectionId, a.subjectId, 'assigned');
  for (const s of slots) {
    const row = touch(s.sectionId, s.subjectId, 'timetable');
    if (row) row.periodsPerWeek += 1;
  }
  for (const id of classTeacherSectionIds) touch(id, null, 'classTeacher');

  return [...rows.values()]
    .sort(
      (a, b) =>
        a.gradeLevel - b.gradeLevel ||
        a.sectionName.localeCompare(b.sectionName) ||
        (a.subjectName === null) - (b.subjectName === null) ||
        (a.subjectName ?? '').localeCompare(b.subjectName ?? '')
    )
    .map(({ gradeLevel: _g, sectionName: _s, ...row }) => row);
}
