import crypto from 'crypto';
import { ORG_CODE_ALPHABET, ORG_CODE_LENGTH } from '@rooted/shared/constants';
import { Tenant } from '../models/Tenant.js';

/**
 * The permanent organization code, stored without a separator. Not the join
 * code: that one is optional, rotatable and buys a pending request, while this
 * one only identifies an org and is safe to show every member.
 */
export function generateOrgCode() {
  // Rejection sampling keeps the alphabet uniform; `b % 31` would favour the
  // first few characters because 256 is not a multiple of 31.
  const limit = 256 - (256 % ORG_CODE_ALPHABET.length);
  let out = '';
  while (out.length < ORG_CODE_LENGTH) {
    for (const b of crypto.randomBytes(ORG_CODE_LENGTH * 2)) {
      if (b < limit && out.length < ORG_CODE_LENGTH) {
        out += ORG_CODE_ALPHABET[b % ORG_CODE_ALPHABET.length];
      }
    }
  }
  return out;
}

/**
 * A code nobody holds yet. Checked up front rather than retried on a duplicate
 * key because provisioning runs in a transaction, where a failed insert aborts
 * the whole thing. The unique index stays the final guard against a race.
 */
export async function allocateOrgCode(generate = generateOrgCode) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const code = generate();
    if (!(await Tenant.exists({ orgCode: code }))) return code;
  }
  throw new Error('Could not allocate an organization code');
}

/**
 * Returns the tenant's code, giving it one first if it has none (created
 * between a deploy and the backfill migration). The write is conditional on the
 * code still being absent, so concurrent callers all end up with the same one.
 */
export async function ensureOrgCode(tenantId) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const current = await Tenant.findById(tenantId, 'orgCode').lean();
    if (!current) return null;
    if (current.orgCode) return current.orgCode;

    try {
      await Tenant.updateOne(
        { _id: tenantId, orgCode: { $exists: false } },
        { $set: { orgCode: await allocateOrgCode() } },
        // orgCode is immutable once set; this is the one write that sets it.
        { overwriteImmutable: true }
      );
    } catch (err) {
      if (err.code !== 11000) throw err;
    }
  }
  throw new Error('Could not assign an organization code');
}
