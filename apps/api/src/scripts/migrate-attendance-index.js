/**
 * migrate-attendance-index.js
 * Usage: node src/scripts/migrate-attendance-index.js
 *
 * Drops the old AttendanceRecord unique index
 * (tenantId,date,entityType,entityId) and rebuilds indexes to match the
 * current schema, which adds subjectId so each subject/period gets its own
 * record per day. Run once against whatever MONGODB_URI is active before
 * deploying the per-period attendance change to an existing database.
 *
 * Exits with 0 on success, 1 on error.
 */

import '../config/env.js';
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { AttendanceRecord } from '../models/AttendanceRecord.js';

const OLD_INDEX_NAME = 'tenantId_1_date_1_entityType_1_entityId_1';

async function run() {
  await mongoose.connect(env.MONGODB_URI);
  console.log('Connected to MongoDB');

  const collection = AttendanceRecord.collection;
  const existing = await collection.indexes();
  const hasOldIndex = existing.some((idx) => idx.name === OLD_INDEX_NAME);

  if (hasOldIndex) {
    await collection.dropIndex(OLD_INDEX_NAME);
    console.log(`Dropped old index: ${OLD_INDEX_NAME}`);
  } else {
    console.log('Old index not present, nothing to drop.');
  }

  await AttendanceRecord.syncIndexes();
  console.log('Indexes synced to current schema.');

  await mongoose.disconnect();
  process.exit(0);
}

run().catch((err) => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
