/**
 * backfill-salary-component-ids.js
 * Usage: node src/scripts/backfill-salary-component-ids.js
 *
 * SalaryStructure.components[] gained a stable `id` field so percentage
 * components' `baseRef` matches by id instead of by `label` (see
 * utils/salaryCalculations.js) — matching by label silently orphans a
 * percentage component whenever its base gets renamed. Existing documents
 * predate this field and still have `baseRef` pointing at a sibling's old
 * label string.
 *
 * For each document, generates a fresh id for every component missing one,
 * then rewrites every percentage component's `baseRef` from the old label
 * string to the corresponding new id, using a label->id map built from that
 * same document's own (pre-migration) components. If a `baseRef` doesn't
 * match any label in the document — i.e. it was already broken/dangling
 * before this migration — it's left unchanged and logged; that structure
 * already failed `resolveComponents` before this migration and still will,
 * not made any worse.
 *
 * Uses the raw driver collection (Model.collection) rather than the
 * Mongoose model, so it works correctly regardless of whether this process
 * has the old or new schema loaded. Idempotent — skips a document if every
 * component already has an `id`.
 *
 * Run against any environment with pre-existing salary data (e.g. the dev
 * DB seeded by seed-demo-data.js) before that environment is used with the
 * new schema/routes — once `resolveComponents` is id-keyed, an unmigrated
 * structure's non-percentage components all collide under the same
 * (missing) key. Not needed for the E2E test DB — `seed:test:clean`
 * regenerates fixtures with ids already present.
 *
 * Exits with 0 on success, 1 on error.
 */

import '../config/env.js';
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { SalaryStructure } from '../models/SalaryStructure.js';

async function run() {
  await mongoose.connect(env.MONGODB_URI);
  console.log('Connected to MongoDB');

  const collection = SalaryStructure.collection;
  const cursor = collection.find({});
  let migrated = 0;
  let warnings = 0;

  for await (const doc of cursor) {
    const raw = doc.components ?? [];
    if (raw.length === 0 || raw.every((c) => c.id)) continue;

    const labelToId = new Map(
      raw.filter((c) => !c.isPercentage).map((c) => [c.label, c.id ?? randomUUID()])
    );

    const components = raw.map((c) => {
      const id = c.id ?? (c.isPercentage ? randomUUID() : labelToId.get(c.label));
      if (!c.isPercentage) return { ...c, id };

      if (!c.baseRef) {
        console.warn(
          `SalaryStructure ${doc._id}: percentage component "${c.label}" has no baseRef at all — ` +
            'leaving unchanged (already broken pre-migration).'
        );
        warnings++;
        return { ...c, id };
      }

      const newBaseRef = labelToId.get(c.baseRef);
      if (!newBaseRef) {
        console.warn(
          `SalaryStructure ${doc._id}: component "${c.label}" has a baseRef ("${c.baseRef}") ` +
            'that does not match any sibling label — leaving baseRef unchanged (already broken pre-migration).'
        );
        warnings++;
        return { ...c, id };
      }
      return { ...c, id, baseRef: newBaseRef };
    });

    await collection.updateOne({ _id: doc._id }, { $set: { components } });
    migrated++;
  }

  console.log(`SalaryStructure: migrated ${migrated} document(s), ${warnings} warning(s).`);

  await mongoose.disconnect();
  process.exit(0);
}

run().catch((err) => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
