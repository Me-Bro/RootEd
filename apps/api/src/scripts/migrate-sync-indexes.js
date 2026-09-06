/**
 * migrate-sync-indexes.js
 * Usage: node src/scripts/migrate-sync-indexes.js [--dry-run] [--model=Tenant,Student]
 *
 * Brings every collection's indexes back in line with its schema.
 *
 * Mongo will not redefine an existing index in place, and Mongoose's autoIndex
 * does not try: adding `sparse`/`unique`/a partial filter to an index that some
 * older deployment already built leaves the old definition running forever. The
 * one that prompted this script was Tenant.subdomain — declared `unique +
 * sparse`, but live as plain `unique` in databases created before the sparse
 * flag landed, so the second subdomain-less organization (every organization
 * created through POST /orgs) died on `E11000 dup key { subdomain: null }`.
 *
 * Per-index migrations already exist for the cases we hit (attendance, grade,
 * timetable, partial-unique). This one is the general net: it syncs whatever
 * has drifted, so a schema index change no longer needs its own script.
 *
 * --dry-run reports drift and exits 1 when any exists, so it doubles as a
 * pre-deploy gate.
 *
 * WARNING: syncIndexes() drops indexes the schema does not declare. Any index
 * created by hand in mongosh and never written into a schema will be removed —
 * check the dry run before applying to a database you care about.
 *
 * Idempotent. Exits 0 on success, 1 on error (or on drift under --dry-run).
 */

import '../config/env.js';
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { connectMonitoringDB } from '../config/monitoringDb.js';
import { allModels, collectIndexDrift, formatDrift } from '../utils/indexDrift.js';

const dryRun = process.argv.includes('--dry-run');
const modelArg = process.argv.find((a) => a.startsWith('--model='));
const only = modelArg
  ? modelArg
      .slice('--model='.length)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  : [];

async function run() {
  // Compiling the models would otherwise kick off autoIndex builds the moment
  // the connection opens, which both writes under --dry-run and throws on the
  // very conflicts this script exists to resolve. syncIndexes() below does the
  // building, in the right order.
  mongoose.set('autoIndex', false);

  await mongoose.connect(env.MONGODB_URI);
  // RequestLog is compiled on the monitoring connection; without this its
  // diff/sync would buffer until it timed out.
  await connectMonitoringDB();
  console.log(`Connected to MongoDB${dryRun ? ' (dry run — no writes)' : ''}`);

  const known = allModels().map((m) => m.modelName);
  const unknown = only.filter((name) => !known.includes(name));
  if (unknown.length) {
    throw new Error(`Unknown model(s): ${unknown.join(', ')}. Known: ${known.join(', ')}`);
  }

  const drift = await collectIndexDrift({ only });
  const checked = only.length || known.length;

  if (!drift.length) {
    console.log(`${checked} model(s) checked — all indexes match their schema.`);
    return 0;
  }

  console.log(`Drift in ${drift.length} of ${checked} model(s):`);
  for (const entry of drift) console.log(`  ${formatDrift(entry)}`);

  if (dryRun) {
    console.log('Dry run — nothing written. Re-run without --dry-run to apply.');
    return 1;
  }

  const byName = new Map(allModels().map((m) => [m.modelName, m]));
  for (const entry of drift) {
    const dropped = await byName.get(entry.modelName).syncIndexes();
    console.log(`  ${entry.modelName}: synced (dropped ${dropped.length || 0})`);
  }

  console.log('Success.');
  return 0;
}

run()
  .then(async (code) => {
    await mongoose.disconnect();
    process.exit(code);
  })
  .catch(async (err) => {
    console.error('Fatal error:', err.message);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
  });
