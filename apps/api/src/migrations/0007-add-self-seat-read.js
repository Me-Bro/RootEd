/**
 * `self:seat:read` lets a study-center learner read their own shift and seat
 * (GET /me/seat). DEFAULT_ROLE_TEMPLATES only reaches tenants as they are
 * provisioned, so student roles that already exist never see it: this adds it to
 * every tenant's student template role.
 *
 * Template roles only (matched by templateKey); a custom role is its admin's to
 * extend. Idempotent ($addToSet). Cached permissions expire within 60s.
 */

import { Role } from '../models/Role.js';

export async function up() {
  await Role.updateMany(
    { templateKey: 'student' },
    { $addToSet: { permissions: 'self:seat:read' } },
    { _bypassTenantScope: true }
  );
}
