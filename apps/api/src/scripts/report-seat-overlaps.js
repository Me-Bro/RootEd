/**
 * report-seat-overlaps.js
 * Usage: node src/scripts/report-seat-overlaps.js [--tenant=<subdomain>] [--json]
 *
 * Read-only. Lists study-center seats that are held in two shifts whose hours overlap,
 * which the seat assignment rule now refuses but older data may still contain. Nothing
 * is ended or moved: the owner resolves each pair from the seat map (move or end one
 * hold; the blocked seat shows there with its reason).
 *
 * A shift with no hours counts as all-day, so it overlaps every other shift.
 *
 * Exits 0 when no overlap is found and 1 when any is (or on error), so it can gate a
 * deploy like `migrate-sync-indexes.js --dry-run`. Run inside the api container:
 *   docker exec -w /app/apps/api rooted-api-1 node src/scripts/report-seat-overlaps.js
 */

import '../config/env.js';
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { Tenant } from '../models/Tenant.js';
import { collectSeatOverlaps, formatOverlapHold } from '../services/seatOverlapReport.service.js';

const asJson = process.argv.includes('--json');
const tenantArg = process.argv.find((a) => a.startsWith('--tenant='));
const subdomain = tenantArg ? tenantArg.slice('--tenant='.length).trim() : '';

async function run() {
  // Reading only: do not let compiling the models build indexes on a live database.
  mongoose.set('autoIndex', false);
  await mongoose.connect(env.MONGODB_URI);

  let tenantId;
  if (subdomain) {
    const tenant = await Tenant.findOne({ subdomain }, '_id').lean();
    if (!tenant) throw new Error(`No tenant with subdomain "${subdomain}"`);
    tenantId = tenant._id;
  }

  const overlaps = await collectSeatOverlaps({ tenantId });

  if (asJson) {
    console.log(JSON.stringify(overlaps, null, 2));
    return overlaps.length ? 1 : 0;
  }

  if (!overlaps.length) {
    console.log('No seat is held in two overlapping shifts.');
    return 0;
  }

  console.log(`${overlaps.length} seat(s) held in two overlapping shifts:`);
  for (const o of overlaps) {
    console.log(
      `  [${o.tenant}] seat ${o.seat}: ${formatOverlapHold(o.first)}  <->  ${formatOverlapHold(o.second)}`
    );
  }
  console.log(
    'Read-only: nothing was changed. Move or end one hold of each pair from the seat map.'
  );
  return 1;
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
