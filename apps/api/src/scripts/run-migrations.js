/**
 * run-migrations.js
 * Usage: node src/scripts/run-migrations.js
 *
 * Manual/CI entry point for the migrations in src/migrations/ — the same
 * runner index.js calls on every boot, exposed standalone so it can be run
 * ahead of a deploy (e.g. `docker exec` into the api container) without
 * starting the HTTP server.
 *
 * Exits with 0 on success, 1 on error.
 */

import '../config/env.js';
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { loadMigrations, runMigrations } from '../utils/migrations.js';

async function run() {
  await mongoose.connect(env.MONGODB_URI);
  console.log('Connected to MongoDB');

  const migrations = await loadMigrations();
  await runMigrations(migrations);
  console.log(`Checked ${migrations.length} migration(s).`);

  await mongoose.disconnect();
  process.exit(0);
}

run().catch((err) => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
