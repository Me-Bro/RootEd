/**
 * migrate-partial-unique-indexes.js
 * Usage: node src/scripts/migrate-partial-unique-indexes.js [--dry-run]
 *
 * Student.(tenantId, userId) and StaffMember.(tenantId, employeeId) were both
 * declared unique + sparse. For a *compound* index that is wrong: Mongo indexes
 * a document when any indexed field is present, and tenantId always is — so
 * every row with a missing userId/employeeId was indexed as null and the second
 * one collided.
 *
 * In practice that meant a roster of students without logins could not be
 * imported past the first, and two staff members without an employee ID could
 * not coexist. Both are the normal case.
 *
 * Both are now partial indexes, filtered to rows that actually carry a value.
 * Mongo will not redefine an existing index in place, so this drops and
 * recreates them via syncIndexes().
 *
 * Idempotent. Exits with 0 on success, 1 on error.
 */

import '../config/env.js';
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { Student } from '../models/Student.js';
import { StaffMember } from '../models/StaffMember.js';

const dryRun = process.argv.includes('--dry-run');

function describe(indexes, name) {
  const ix = indexes.find((i) => i.name === name);
  if (!ix) return 'absent';
  if (ix.partialFilterExpression) return `partial ${JSON.stringify(ix.partialFilterExpression)}`;
  return ix.sparse ? 'sparse (wrong)' : 'plain';
}

async function run() {
  await mongoose.connect(env.MONGODB_URI);
  console.log(`Connected to MongoDB${dryRun ? ' (dry run — no writes)' : ''}`);

  const targets = [
    { model: Student, index: 'tenantId_1_userId_1' },
    { model: StaffMember, index: 'tenantId_1_employeeId_1' },
  ];

  for (const { model, index } of targets) {
    const before = await model.collection.indexes();
    console.log(`${model.modelName}.${index}: ${describe(before, index)}`);

    if (!dryRun) {
      await model.syncIndexes();
      const after = await model.collection.indexes();
      console.log(`  -> ${describe(after, index)}`);
    }
  }

  console.log(dryRun ? 'Dry run complete — nothing written.' : 'Success.');
  await mongoose.disconnect();
  process.exit(0);
}

run().catch((err) => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
