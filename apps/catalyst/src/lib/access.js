import { isModuleEnabled } from '@rooted/shared/utils';

export const hasPermission = (user, permission) => (user?.permissions ?? []).includes(permission);

/** The college the session is currently scoped to, from GET /auth/me. */
export const currentCollege = (user) =>
  (user?.orgs ?? []).find((o) => String(o._id) === String(user?.tenantId)) ?? null;

/**
 * Where a signed-in person belongs. Pure, so the guards, the post-login
 * redirect and the "nothing to open" page all agree.
 *
 * `reason` is only set for /no-access: no-college (belongs to nothing), module
 * (their college has not switched the programme on) or role (their role has no
 * training permission).
 */
export function homeRoute(user) {
  if (!user) return { path: '/login' };
  if (user.systemRole === 'super_admin') return { path: '/outcomes' };

  if ((user.orgs ?? []).length === 0) return { path: '/no-access', reason: 'no-college' };
  if (!user.tenantId) return { path: '/select-college' };
  if (!isModuleEnabled(user, 'training')) return { path: '/no-access', reason: 'module' };

  if (hasPermission(user, 'training:read')) return { path: '/dashboard' };
  if (hasPermission(user, 'self:training:read')) return { path: '/me/progress' };
  return { path: '/no-access', reason: 'role' };
}
