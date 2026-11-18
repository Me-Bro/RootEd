/**
 * A study center has one tier, the Batch, and a batch is a shift with its own hours. Until
 * now the hours lived on a Section inside a class (one "Batches" class holding Morning and
 * Evening). This makes every existing study-center class a batch with exactly one mirrored
 * section, splitting a class that held several shifts into one batch each.
 *
 * Section ids never change, so seats, enrolments, fee plans and visits keep pointing at the
 * right shift. Idempotent: a tenant already in shape makes no writes.
 */

import { Tenant } from '../models/Tenant.js';
import { normalizeBatches } from '../services/batch.service.js';

export async function up() {
  const tenants = await Tenant.find({ orgType: 'study_center' }, '_id').lean();
  for (const { _id: tenantId } of tenants) {
    await normalizeBatches(tenantId);
  }
}
