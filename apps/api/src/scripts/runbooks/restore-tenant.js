/**
 * Runbook: restore-tenant
 * Usage: node restore-tenant.js --tenantId=<id>
 *
 * Connects to MongoDB, finds the archived tenant, checks dataRetentionUntil,
 * and if still within the retention window sets status=active.
 */
import mongoose from 'mongoose';
import { Tenant } from '../../models/Tenant.js';

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v];
  })
);

const { tenantId } = args;

if (!tenantId) {
  console.error('Error: --tenantId is required');
  process.exit(1);
}

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('Error: MONGODB_URI environment variable is required');
  process.exit(1);
}

async function run() {
  await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
  console.log('Connected to MongoDB');

  const tenant = await Tenant.findById(tenantId);
  if (!tenant) {
    console.error(`Error: Tenant ${tenantId} not found`);
    process.exit(1);
  }

  if (tenant.status !== 'archived') {
    console.error(`Error: Tenant ${tenantId} is not archived (status: ${tenant.status})`);
    process.exit(1);
  }

  const now = new Date();
  if (tenant.dataRetentionUntil && tenant.dataRetentionUntil < now) {
    console.error(
      `Error: Data retention window has expired for tenant ${tenantId}. ` +
      `dataRetentionUntil was ${tenant.dataRetentionUntil.toISOString()}, now is ${now.toISOString()}.`
    );
    process.exit(1);
  }

  tenant.status = 'active';
  tenant.archivedAt = undefined;
  await tenant.save();

  console.log(`Success: Tenant ${tenantId} (${tenant.name}) restored to active.`);
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
