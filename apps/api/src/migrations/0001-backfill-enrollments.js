/**
 * Every existing Student with a sectionId gets an active Enrollment row for
 * that section, so batch rosters (Enrollment-based, used for
 * tuition/coaching/study-center orgTypes) match what Student.sectionId
 * already implied. Student.sectionId itself is untouched — still the
 * school/college homeroom.
 *
 * Idempotent — the {tenantId,studentId,sectionId} unique index makes re-runs
 * a no-op for rows already backfilled.
 */

import { Student } from '../models/Student.js';
import { Enrollment } from '../models/Enrollment.js';
import { logger } from '../utils/logger.js';

export async function up() {
  const students = await Student.find(
    { sectionId: { $exists: true, $ne: null } },
    'tenantId sectionId createdAt',
    { _bypassTenantScope: true }
  ).lean();

  let created = 0;
  let skipped = 0;
  for (const student of students) {
    const result = await Enrollment.updateOne(
      { tenantId: student.tenantId, studentId: student._id, sectionId: student.sectionId },
      {
        $setOnInsert: {
          tenantId: student.tenantId,
          studentId: student._id,
          sectionId: student.sectionId,
          status: 'active',
          startDate: student.createdAt ?? new Date(),
        },
      },
      { upsert: true }
    );
    if (result.upsertedCount > 0) created++;
    else skipped++;
  }

  logger.info({ created, skipped }, 'backfill-enrollments: done');
}
