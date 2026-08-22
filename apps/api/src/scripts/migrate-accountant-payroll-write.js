/**
 * migrate-accountant-payroll-write.js
 * Usage: node src/scripts/migrate-accountant-payroll-write.js
 *
 * DEFAULT_ROLE_TEMPLATES.accountant now includes 'payroll:write', but that
 * constant is only read at tenant-provisioning time — already-provisioned
 * tenants' accountant Role docs won't pick it up on their own. Backfills
 * 'payroll:write' onto every existing accountant Role doc, across all
 * tenants. Idempotent (uses $addToSet).
 *
 * Exits with 0 on success, 1 on error.
 */

import '../config/env.js';
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { Role } from '../models/Role.js';

async function run() {
  await mongoose.connect(env.MONGODB_URI);
  console.log('Connected to MongoDB');

  const result = await Role.updateMany(
    { templateKey: 'accountant' },
    { $addToSet: { permissions: 'payroll:write' } },
    { _bypassTenantScope: true }
  );
  console.log(
    `Matched ${result.matchedCount}, modified ${result.modifiedCount} accountant role(s).`
  );

  await mongoose.disconnect();
  process.exit(0);
}

run().catch((err) => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
