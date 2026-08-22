/**
 * Admins see every timetable entry (draft + published). Everyone else only
 * sees entries belonging to a published (academicYearId, sectionId) pair —
 * unpublished sections stay invisible outside the admin editing view.
 */
export function filterVisibleTimetableEntries(entries, publishedKeys, isAdmin) {
  if (isAdmin) return entries;
  return entries.filter((e) => publishedKeys.has(`${e.academicYearId}:${e.sectionId}`));
}
