/**
 * `self:seat:write` lets a study-center learner check in and out by scanning the
 * centre's QR code (POST /me/visits/scan). Adds it to every tenant's student
 * template role, like 0007 did for `self:seat:read`. Template roles only; idempotent.
 */

import { Role } from '../models/Role.js';

export async function up() {
  await Role.updateMany(
    { templateKey: 'student' },
    { $addToSet: { permissions: 'self:seat:write' } },
    { _bypassTenantScope: true }
  );
}
