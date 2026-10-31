/** Where each "open this class" button goes, from one row of GET /academic/teaching-load. */
export function classLinks({ sectionId, subjectId }) {
  const section = `sectionId=${encodeURIComponent(sectionId)}`;
  return {
    attendance: `/academic/attendance?${section}`,
    grades: `/academic/grades?${section}${subjectId ? `&subjectId=${encodeURIComponent(subjectId)}` : ''}`,
    students: `/academic/students?${section}`,
  };
}

/** The section ids a teacher covers, for putting their own classes first in a picker. */
export function mySectionIds(items) {
  return new Set(items.map((i) => i.sectionId));
}
