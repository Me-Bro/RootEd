/**
 * backfill-enrollments.js
 * Usage: node src/scripts/backfill-enrollments.js
 *
 * One-off backfill for the new Enrollment model: every existing Student with
 * a sectionId gets an active Enrollment row for that section, so batch
 * rosters (Enrollment-based, used for tuition/coaching/study-center orgTypes)
 * match what Student.sectionId already implied. Student.sectionId itself is
 * untouched — still the school/college homeroom.
 *
 * Idempotent — the {tenantId,studentId,sectionId} unique index makes re-runs
 * a no-op for rows already backfilled.
 *
 * Exits with 0 on success, 1 on error.
 */

import '../config/env.js';
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { Student } from '../models/Student.js';
import { Enrollment } from '../models/Enrollment.js';

async function run() {
  await mongoose.connect(env.MONGODB_URI);
  console.log('Connected to MongoDB');

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

  console.log(`Backfilled ${created} enrollment(s), skipped ${skipped} (already present)`);

  await Enrollment.syncIndexes();
  console.log('Indexes synced.');

  await mongoose.disconnect();
  process.exit(0);
}

run().catch((err) => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
