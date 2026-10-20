/**
 * DEFAULT_ROLE_TEMPLATES gained the training permissions, but that constant is
 * only read when a tenant is provisioned — roles that already exist never see
 * the change. This adds the training permissions each template now carries to
 * every tenant's matching template role.
 *
 * Only the four templates that changed are touched, and only template roles
 * (matched by templateKey): a custom role an admin built by hand is theirs to
 * extend. `training:complete` reaches tenant_admin and nothing else, because it
 * is the one permission DEFAULT_ROLE_TEMPLATES keeps off every other template.
 *
 * Idempotent ($addToSet). Cached permissions expire within 60s.
 */

import { Role, DEFAULT_ROLE_TEMPLATES } from '../models/Role.js';

const TEMPLATES_TO_UPDATE = ['tenant_admin', 'principal', 'teacher', 'student'];

// Matches 'training:*' and the self-scoped 'self:training:*'.
const isTraining = (permission) => /(^|:)training:/.test(permission);

export async function up() {
  for (const templateKey of TEMPLATES_TO_UPDATE) {
    const additions = DEFAULT_ROLE_TEMPLATES[templateKey].filter(isTraining);
    if (!additions.length) continue;
    await Role.updateMany(
      { templateKey },
      { $addToSet: { permissions: { $each: additions } } },
      { _bypassTenantScope: true }
    );
  }
}
