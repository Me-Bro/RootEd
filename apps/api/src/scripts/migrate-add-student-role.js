/**
 * migrate-add-student-role.js
 * Usage: node src/scripts/migrate-add-student-role.js [--dry-run]
 *
 * DEFAULT_ROLE_TEMPLATES gained a 'student' template, but that constant is only
 * read at tenant-provisioning time — tenants created before it have no student
 * role to assign, so nobody in them can be given self-scoped access.
 *
 * Creates the missing role per tenant and keeps an existing one in step with
 * the template. It grants only self: permissions, which are served exclusively
 * by the /me router and never expose another student's records.
 *
 * Idempotent (upsert). Exits with 0 on success, 1 on error.
 */

import '../config/env.js';
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { Tenant } from '../models/Tenant.js';
import { Role, DEFAULT_ROLE_TEMPLATES } from '../models/Role.js';

const dryRun = process.argv.includes('--dry-run');
const PERMISSIONS = DEFAULT_ROLE_TEMPLATES.student;

async function run() {
  await mongoose.connect(env.MONGODB_URI);
  console.log(`Connected to MongoDB${dryRun ? ' (dry run — no writes)' : ''}`);
  console.log(`student template: ${PERMISSIONS.join(', ')}`);

  const tenants = await Tenant.find({}, '_id name').lean();
  const existing = await Role.find({ templateKey: 'student' }, 'tenantId', {
    _bypassTenantScope: true,
  }).lean();
  const haveIt = new Set(existing.map((r) => String(r.tenantId)));

  const missing = tenants.filter((t) => !haveIt.has(String(t._id)));
  console.log(`tenants: ${tenants.length}, missing a student role: ${missing.length}`);
  for (const t of missing) console.log(`  ${t._id} — ${t.name}`);

  if (dryRun) {
    console.log('Dry run complete — nothing written.');
  } else {
    for (const tenant of tenants) {
      await Role.findOneAndUpdate(
        { tenantId: tenant._id, templateKey: 'student' },
        {
          $set: { permissions: PERMISSIONS, isTemplate: true },
          $setOnInsert: { tenantId: tenant._id, name: 'student', templateKey: 'student' },
        },
        { upsert: true, setDefaultsOnInsert: true }
      );
    }
    console.log(`Success: ${tenants.length} tenant(s) now have a student role.`);
    console.log('Cached permissions expire within 60s.');
  }

  await mongoose.disconnect();
  process.exit(0);
}

run().catch((err) => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
