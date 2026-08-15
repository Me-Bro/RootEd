import { TenantMembership } from '../models/TenantMembership.js';
import { Role } from '../models/Role.js';
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
      if (req.user?.systemRole === 'super_admin') return next();
      if (!req.tenant) return next(new AppError('Tenant context missing', 400));

      const permissions = await resolvePermissions(req.user.sub, req.tenant._id.toString());
      if (!permissions.includes(permission)) return next(new AppError('Forbidden', 403));
      next();
    } catch (err) {
      next(err);
    }
  };
}
