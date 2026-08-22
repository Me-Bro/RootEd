/**
 * migrate-grade-index.js
 * Usage: node src/scripts/migrate-grade-index.js
 *
 * Drops the old Grade unique index (tenantId,studentId,subjectId,termId) and
 * rebuilds indexes to match the current schema, which adds assessmentType
 * (so a student can have a quiz/midterm/final score per subject/term
 * instead of just one) and a required sectionId.
 *
 * Unlike migrate-attendance-index.js, this script backfills existing
 * documents BEFORE syncing indexes:
 *   - assessmentType only gets Mongoose's schema `default: 'final'` on
 *     document creation, never retroactively — existing rows have the field
 *     missing outright, not 'final'.
 *   - sectionId is `required: true` on the new schema, but `required` is
 *     only enforced by Mongoose validators (.save()/.create()), which this
 *     migration doesn't run — it's backfilled here via Student.sectionId so
 *     future sectionId-filtered queries (grade analytics) don't silently
 *     skip pre-migration rows.
 * Backfilling isn't needed to avoid a duplicate-key error on the new unique
 * index: the old 4-field index already guaranteed no two existing rows
 * shared {tenantId,studentId,subjectId,termId}, so appending assessmentType
 * (even as a uniformly-missing 5th key) can't introduce a new collision.
 *
 * Exits with 0 on success, 1 on error.
 */

import '../config/env.js';
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { Grade } from '../models/Grade.js';
import { Student } from '../models/Student.js';

const OLD_INDEX_NAME = 'tenantId_1_studentId_1_subjectId_1_termId_1';

async function run() {
  await mongoose.connect(env.MONGODB_URI);
  console.log('Connected to MongoDB');

  const collection = Grade.collection;

  const missingAssessmentType = await collection.updateMany(
    { assessmentType: { $exists: false } },
    { $set: { assessmentType: 'final' } }
  );
  console.log(`Backfilled assessmentType on ${missingAssessmentType.modifiedCount} grade(s)`);

  const rowsMissingSection = await collection
    .find({ sectionId: { $exists: false } }, { projection: { studentId: 1 } })
    .toArray();

  const studentIds = [...new Set(rowsMissingSection.map((r) => r.studentId.toString()))];
  const students = await Student.find({ _id: { $in: studentIds } }, null, {
    _bypassTenantScope: true,
  }).lean();
  const sectionByStudent = new Map(
    students.filter((s) => s.sectionId).map((s) => [s._id.toString(), s.sectionId])
  );

  let updated = 0;
  let skippedNoSection = 0;
  for (const row of rowsMissingSection) {
    const sectionId = sectionByStudent.get(row.studentId.toString());
    if (!sectionId) {
      skippedNoSection++;
      continue;
    }
    await collection.updateOne({ _id: row._id }, { $set: { sectionId } });
    updated++;
  }
  console.log(
    `Backfilled sectionId on ${updated} grade(s), skipped ${skippedNoSection} (student has no section)`
  );

  const existingIndexes = await collection.indexes();
  const hasOldIndex = existingIndexes.some((idx) => idx.name === OLD_INDEX_NAME);

  if (hasOldIndex) {
    await collection.dropIndex(OLD_INDEX_NAME);
    console.log(`Dropped old index: ${OLD_INDEX_NAME}`);
  } else {
    console.log('Old index not present, nothing to drop.');
  }

  await Grade.syncIndexes();
  console.log('Indexes synced to current schema.');

  await mongoose.disconnect();
  process.exit(0);
}

run().catch((err) => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
