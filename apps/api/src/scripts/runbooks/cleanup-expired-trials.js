/**
 * Runbook: cleanup-expired-trials
 * Usage: node cleanup-expired-trials.js [--confirm]
 *
 * Finds all tenants with isTrialActive=true and trialEndsAt < now,
 * prints the list, then (with --confirm flag) bulk sets isTrialActive=false.
 */
import mongoose from 'mongoose';
import { Tenant } from '../../models/Tenant.js';

const confirm = process.argv.includes('--confirm');

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('Error: MONGODB_URI environment variable is required');
  process.exit(1);
}

async function run() {
  await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
  console.log('Connected to MongoDB');

  const now = new Date();
  const expiredTenants = await Tenant.find(
    { isTrialActive: true, trialEndsAt: { $lt: now } },
    { _id: 1, name: 1, subdomain: 1, trialEndsAt: 1 }
  ).lean();

  if (expiredTenants.length === 0) {
    console.log('No expired trials found.');
    await mongoose.disconnect();
    return;
  }

  console.log(`\nFound ${expiredTenants.length} tenant(s) with expired trials:\n`);
  expiredTenants.forEach((t) => {
    console.log(`  - [${t._id}] ${t.name} (${t.subdomain}) — trial ended ${t.trialEndsAt.toISOString()}`);
  });

  if (!confirm) {
    console.log('\nDry run complete. Re-run with --confirm to apply changes.');
    await mongoose.disconnect();
    return;
  }

  const ids = expiredTenants.map((t) => t._id);
  const result = await Tenant.updateMany(
    { _id: { $in: ids } },
    { $set: { isTrialActive: false } }
  );

  console.log(`\nSuccess: ${result.modifiedCount} tenant(s) updated — isTrialActive set to false.`);
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
