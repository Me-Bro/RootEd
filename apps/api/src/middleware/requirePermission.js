import { TenantMembership } from '../models/TenantMembership.js';
import { Role, DEFAULT_ROLE_TEMPLATES } from '../models/Role.js';
import { redis } from '../config/redis.js';
import { AppError } from './errorHandler.js';

const CACHE_TTL = 60;

export async function resolvePermissions(userId, tenantId) {
  const cacheKey = `perms:${tenantId}:${userId}`;
  const cached = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached);

  const membership = await TenantMembership.findOne({ userId, tenantId, status: 'active' }).lean();
  if (!membership) return [];

  const roles = await Role.find({
    _id: { $in: membership.roleIds },
    tenantId,
  }).lean();

  const permissions = [...new Set(roles.flatMap((r) => r.permissions))];
  await redis.setex(cacheKey, CACHE_TTL, JSON.stringify(permissions));
  return permissions;
}

export function requirePermission(permission) {
  return async (req, _res, next) => {
    try {
      if (!req.tenant) return next(new AppError('Tenant context missing', 400));

      // A super_admin only gets tenant-module access while actively impersonating
      // that specific tenant (see POST /admin/tenants/:id/impersonate) — not by
      // virtue of the systemRole alone. This keeps every tenant_admin-equivalent
      // action attributable to an explicit, audited impersonation session.
      if (req.user?.systemRole === 'super_admin') {
        if (req.user.impersonatedTenantId === req.tenant._id.toString()) return next();
        return next(
          new AppError('Forbidden — impersonate this tenant to access tenant modules', 403)
        );
      }

      const permissions = await resolvePermissions(req.user.sub, req.tenant._id.toString());
      if (!permissions.includes(permission)) return next(new AppError('Forbidden', 403));
      next();
    } catch (err) {
      next(err);
    }
  };
}

export function effectivePermissionsFor(user) {
  return user?.systemRole === 'super_admin' && user.impersonatedTenantId
    ? DEFAULT_ROLE_TEMPLATES.tenant_admin
    : null;
}
