/**
 * Gives every existing organization its permanent org code. Archived and
 * suspended tenants are included: a code is never reused, so a closed org must
 * keep its own. Idempotent: only tenants without a code are touched.
 */

import { Tenant } from '../models/Tenant.js';
import { ensureOrgCode } from '../services/orgCode.service.js';

export async function up() {
  const tenants = await Tenant.find({ orgCode: { $exists: false } }, '_id').lean();
  for (const { _id } of tenants) await ensureOrgCode(_id);
}
