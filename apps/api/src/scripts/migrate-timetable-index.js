/**
 * migrate-timetable-index.js
 * Usage: node src/scripts/migrate-timetable-index.js
 *
 * Replaces the old non-unique Timetable indexes — which didn't even include
 * periodNumber, so they weren't enforcing anything — with unique compound
 * indexes on {tenantId,academicYearId,sectionId,dayOfWeek,periodNumber} and
 * {tenantId,academicYearId,teacherId,dayOfWeek,periodNumber}, plus a new
 * partial-unique index on room. Also ensures the new TimetablePublish
 * collection's index exists.
 *
 * Checks for pre-existing duplicate section/day/period combos first —
 * creating the unique index would otherwise fail outright. None are
 * expected since the old route code already checked for conflicts before
 * every create, just not atomically.
 *
 * Exits with 0 on success, 1 on error.
 */

import '../config/env.js';
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { Timetable } from '../models/Timetable.js';
import { TimetablePublish } from '../models/TimetablePublish.js';

const OLD_SECTION_INDEX = 'tenantId_1_academicYearId_1_sectionId_1';
const OLD_TEACHER_INDEX = 'tenantId_1_teacherId_1_dayOfWeek_1';

async function run() {
  await mongoose.connect(env.MONGODB_URI);
  console.log('Connected to MongoDB');

  const collection = Timetable.collection;

  const duplicateSectionSlots = await collection
    .aggregate([
      {
        $group: {
          _id: {
            tenantId: '$tenantId',
            academicYearId: '$academicYearId',
            sectionId: '$sectionId',
            dayOfWeek: '$dayOfWeek',
            periodNumber: '$periodNumber',
          },
          count: { $sum: 1 },
        },
      },
      { $match: { count: { $gt: 1 } } },
    ])
    .toArray();

  if (duplicateSectionSlots.length > 0) {
    console.error(
      `Found ${duplicateSectionSlots.length} duplicate section/day/period combo(s) — resolve these before syncing the unique index:`,
      duplicateSectionSlots
    );
    await mongoose.disconnect();
    process.exit(1);
  }
  console.log('No duplicate section/day/period combos found.');

  const existingIndexes = await collection.indexes();
  for (const name of [OLD_SECTION_INDEX, OLD_TEACHER_INDEX]) {
    if (existingIndexes.some((idx) => idx.name === name)) {
      await collection.dropIndex(name);
      console.log(`Dropped old index: ${name}`);
    } else {
      console.log(`Old index not present, nothing to drop: ${name}`);
    }
  }

  await Timetable.syncIndexes();
  console.log('Timetable indexes synced to current schema.');

  await TimetablePublish.syncIndexes();
  console.log('TimetablePublish indexes synced.');

  await mongoose.disconnect();
  process.exit(0);
}

run().catch((err) => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
