/**
 * migrate-clear-trials.js
 * Usage: node src/scripts/migrate-clear-trials.js [--dry-run]
 *
 * Registration and organization creation are free (see
 * docs/adr/006-free-tier-and-deferred-billing.txt), so no tenant should be
 * carrying a live trial. Every tenant provisioned before that decision has
 * isTrialActive: true, and the trial-expiry worker mails those tenants
 * "your 14-day trial has expired, please upgrade" — for features they still
 * have, and cannot pay for.
 *
 * Clears isTrialActive so there is nothing for the worker to act on even if it
 * is started. trialEndsAt is left in place as a record of what was, and because
 * the same fields carry a premium trial when billing is switched on.
 *
 * Idempotent. Exits with 0 on success, 1 on error.
 */

import '../config/env.js';
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { Tenant } from '../models/Tenant.js';

const dryRun = process.argv.includes('--dry-run');

async function run() {
  await mongoose.connect(env.MONGODB_URI);
  console.log(`Connected to MongoDB${dryRun ? ' (dry run — no writes)' : ''}`);

  if (env.BILLING_ENABLED) {
    console.error('BILLING_ENABLED is true — refusing to clear live trials.');
    await mongoose.disconnect();
    process.exit(1);
  }

  const affected = await Tenant.find({ isTrialActive: true }, '_id name trialEndsAt').lean();
  console.log(`tenants with a live trial: ${affected.length}`);
  for (const t of affected) {
    console.log(`  ${t._id} — ${t.name} (trial ended ${t.trialEndsAt?.toISOString() ?? 'n/a'})`);
  }

  if (dryRun) {
    console.log('Dry run complete — nothing written.');
  } else if (affected.length) {
    const result = await Tenant.updateMany(
      { isTrialActive: true },
      { $set: { isTrialActive: false } }
    );
    console.log(`Success: ${result.modifiedCount} tenant(s) updated.`);
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
