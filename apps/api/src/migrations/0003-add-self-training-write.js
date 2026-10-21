/**
 * `self:training:write` lets a student tick off, answer and attach links on
 * their own learning roadmap. DEFAULT_ROLE_TEMPLATES only reaches tenants as
 * they are provisioned, so roles that already exist never see it: this adds it
 * to every tenant's student template role.
 *
 * Template roles only (matched by templateKey); a custom role is its admin's to
 * extend. Idempotent ($addToSet). Cached permissions expire within 60s.
 */

import { Role } from '../models/Role.js';

export async function up() {
  await Role.updateMany(
    { templateKey: 'student' },
    { $addToSet: { permissions: 'self:training:write' } },
    { _bypassTenantScope: true }
  );
}
