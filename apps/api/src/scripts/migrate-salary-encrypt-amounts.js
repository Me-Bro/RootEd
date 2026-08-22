/**
 * migrate-salary-encrypt-amounts.js
 * Usage: node src/scripts/migrate-salary-encrypt-amounts.js
 *
 * SalaryStructure.components[].amount and SalarySlip.{components[].amount,
 * grossEarnings,totalDeductions,netPay} moved from plaintext Number to
 * AES-256-GCM ciphertext String (see services/salary.service.js). Existing
 * documents still hold plaintext Numbers, which decryptField() cannot parse
 * (JSON.parse on a bare number succeeds but yields no iv/ciphertext/tag,
 * so Buffer.from(undefined,'hex') throws). Backfills ciphertext for every
 * pre-existing document, across all tenants. Idempotent — skips fields that
 * already look like encrypted JSON.
 *
 * Uses the raw driver collection (Model.collection) rather than the
 * Mongoose model, so it works correctly regardless of whether this process
 * has the old or new schema loaded.
 *
 * Run against any environment with pre-existing salary data (e.g. the dev
 * DB seeded by seed-demo-data.js) before that environment is used with the
 * new schema/routes. Not needed for the E2E test DB — `seed:test:clean`
 * regenerates fixtures fresh in the encrypted format.
 *
 * Exits with 0 on success, 1 on error.
 */

import '../config/env.js';
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { SalaryStructure } from '../models/SalaryStructure.js';
import { SalarySlip } from '../models/SalarySlip.js';
import { encryptField } from '../utils/fieldEncryption.js';

function isAlreadyEncrypted(value) {
  if (typeof value !== 'string') return false;
  try {
    const parsed = JSON.parse(value);
    return Boolean(parsed && parsed.iv && parsed.ciphertext && parsed.tag);
  } catch {
    return false;
  }
}

function encryptIfNeeded(value, tenantId) {
  if (isAlreadyEncrypted(value)) return { value, changed: false };
  return { value: encryptField(String(value), tenantId), changed: true };
}

async function migrateSalaryStructures() {
  const collection = SalaryStructure.collection;
  const cursor = collection.find({});
  let migrated = 0;

  for await (const doc of cursor) {
    let changed = false;
    const components = (doc.components ?? []).map((c) => {
      const { value, changed: didChange } = encryptIfNeeded(c.amount, doc.tenantId);
      if (didChange) changed = true;
      return { ...c, amount: value };
    });

    if (changed) {
      await collection.updateOne({ _id: doc._id }, { $set: { components } });
      migrated++;
    }
  }

  console.log(`SalaryStructure: migrated ${migrated} document(s).`);
}

async function migrateSalarySlips() {
  const collection = SalarySlip.collection;
  const cursor = collection.find({});
  let migrated = 0;

  for await (const doc of cursor) {
    let changed = false;
    const components = (doc.components ?? []).map((c) => {
      const { value, changed: didChange } = encryptIfNeeded(c.amount, doc.tenantId);
      if (didChange) changed = true;
      return { ...c, amount: value };
    });

    const totals = {};
    for (const field of ['grossEarnings', 'totalDeductions', 'netPay']) {
      if (doc[field] == null) continue;
      const { value, changed: didChange } = encryptIfNeeded(doc[field], doc.tenantId);
      totals[field] = value;
      if (didChange) changed = true;
    }

    if (changed) {
      await collection.updateOne({ _id: doc._id }, { $set: { components, ...totals } });
      migrated++;
    }
  }

  console.log(`SalarySlip: migrated ${migrated} document(s).`);
}

async function run() {
  await mongoose.connect(env.MONGODB_URI);
  console.log('Connected to MongoDB');

  await migrateSalaryStructures();
  await migrateSalarySlips();

  await mongoose.disconnect();
  process.exit(0);
}

run().catch((err) => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
