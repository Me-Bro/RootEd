/**
 * `front_desk` is a role template for study centers only. DEFAULT_ROLE_TEMPLATES
 * reaches a tenant as it is provisioned, so study centers that already exist have
 * no such role; this adds it to each one.
 *
 * Only `study_center` tenants, and only when no `front_desk` template role is
 * there yet (matched by templateKey), so a re-run, or a role an admin already
 * created by hand under that key, is left alone. Idempotent ($setOnInsert).
 */

import { Tenant } from '../models/Tenant.js';
import { Role, DEFAULT_ROLE_TEMPLATES } from '../models/Role.js';

export async function up() {
  const tenants = await Tenant.find({ orgType: 'study_center' }, '_id').lean();
  for (const { _id: tenantId } of tenants) {
    await Role.updateOne(
      { tenantId, templateKey: 'front_desk' },
      {
        $setOnInsert: {
          tenantId,
          name: 'front desk',
          templateKey: 'front_desk',
          isTemplate: true,
          permissions: DEFAULT_ROLE_TEMPLATES.front_desk,
        },
      },
      { upsert: true, _bypassTenantScope: true }
    );
  }
}
