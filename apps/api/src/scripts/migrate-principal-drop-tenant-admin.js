/**
 * migrate-principal-drop-tenant-admin.js
 * Usage: node src/scripts/migrate-principal-drop-tenant-admin.js [--dry-run]
 *
 * DEFAULT_ROLE_TEMPLATES.principal no longer includes 'tenant:admin', but that
 * constant is only read at tenant-provisioning time — already-provisioned
 * tenants' principal Role docs keep whatever they were seeded with. Removes
 * 'tenant:admin' from every existing principal Role, across all tenants.
 *
 * The template was built as "everything that does not end in ':write'", and
 * 'tenant:admin' does not end in ':write', so it was included by accident.
 * Every principal has therefore been a de-facto tenant administrator: able to
 * change tenant settings, broadcast to the whole organization, and read or
 * rotate the join code.
 *
 * This is a privilege *reduction*, so it is deliberately blunt: a tenant that
 * intentionally granted tenant:admin to its principal role will lose it and
 * must re-grant it explicitly. That is the same trade-off
 * migrate-accountant-payroll-write.js made in the opposite direction.
 *
 * Idempotent ($pull). Exits with 0 on success, 1 on error.
 */

import '../config/env.js';
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { Role } from '../models/Role.js';

const dryRun = process.argv.includes('--dry-run');

async function run() {
  await mongoose.connect(env.MONGODB_URI);
  console.log(`Connected to MongoDB${dryRun ? ' (dry run — no writes)' : ''}`);

  const filter = { templateKey: 'principal', permissions: 'tenant:admin' };
  const affected = await Role.find(filter, '_id tenantId name', {
    _bypassTenantScope: true,
  }).lean();

  console.log(`principal roles still holding tenant:admin: ${affected.length}`);
  for (const role of affected) {
    console.log(`  tenant ${role.tenantId} — role "${role.name}"`);
  }

  if (dryRun) {
    console.log('Dry run complete — nothing written.');
  } else if (affected.length) {
    const result = await Role.updateMany(
      filter,
      { $pull: { permissions: 'tenant:admin' } },
      { _bypassTenantScope: true }
    );
    console.log(`Success: ${result.modifiedCount} principal role(s) updated.`);
    // Resolved permissions are cached for 60s per (tenantId, userId); the
    // change takes effect within that window without any further action.
    console.log('Cached permissions expire within 60s.');
  } else {
    console.log('Nothing to do.');
  }

  await mongoose.disconnect();
  process.exit(0);
}

run().catch((err) => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
