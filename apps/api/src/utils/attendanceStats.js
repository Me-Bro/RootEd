const PRESENT_STATUSES = new Set(['present', 'late']);

/**
 * Per-student attendance % across every attendance record in range
 * (period-level, not per-day) — a student present in Math but absent in
 * English the same day contributes one present and one absent record.
 */
export function computeAttendanceStats(students, records, thresholdPct) {
  const byStudent = new Map();
  for (const student of students) {
    byStudent.set(String(student._id), { presentCount: 0, totalCount: 0 });
  }

  let totalPresent = 0;
  let totalAll = 0;
  for (const record of records) {
    const bucket = byStudent.get(String(record.entityId));
    if (!bucket) continue;
    const isPresent = PRESENT_STATUSES.has(record.status);
    bucket.totalCount += 1;
    totalAll += 1;
    if (isPresent) {
      bucket.presentCount += 1;
      totalPresent += 1;
    }
  }

  const studentStats = students.map((student) => {
    const studentId = String(student._id);
    const { presentCount, totalCount } = byStudent.get(studentId);
    const pct = totalCount > 0 ? Math.round((presentCount / totalCount) * 100) : null;
    return {
      studentId,
      firstName: student.firstName,
      lastName: student.lastName,
      admissionNo: student.admissionNo,
      // Guardian phone for report/call-chip consumers — already on the
      // Student document (Student.find() has no restrictive projection), so
      // no query change is needed to surface it here.
      guardianPhone: student.parentContacts?.[0]?.phone ?? null,
      presentCount,
      totalCount,
      pct,
      isDefaulter: pct !== null && pct < thresholdPct,
    };
  });

  const classAveragePct = totalAll > 0 ? Math.round((totalPresent / totalAll) * 100) : null;

  return { students: studentStats, classAveragePct };
}
