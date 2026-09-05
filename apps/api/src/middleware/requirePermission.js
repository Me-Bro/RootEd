import { TenantMembership } from '../models/TenantMembership.js';
import { Role, DEFAULT_ROLE_TEMPLATES } from '../models/Role.js';
import { Student } from '../models/Student.js';
import { StaffMember } from '../models/StaffMember.js';
import { redis } from '../config/redis.js';
import { AppError } from './errorHandler.js';

const CACHE_TTL = 60;

const EMPTY_CONTEXT = { permissions: [], subjects: {} };

/**
 * What this member may do, and who they are, in one tenant.
 *
 * `subjects` is derived from the existing links (StaffMember.userId,
 * Student.userId) rather than denormalised onto the membership: two writers
 * for the same fact is how it drifts. It is cached alongside the permissions
 * because every self-scoped request needs both, and they are invalidated by
 * exactly the same events.
 */
export async function resolveContext(userId, tenantId) {
  const cacheKey = `ctx:${tenantId}:${userId}`;
  const cached = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached);

  const membership = await TenantMembership.findOne({ userId, tenantId, status: 'active' }).lean();
  if (!membership) return EMPTY_CONTEXT;

  const [roles, staff, student] = await Promise.all([
    Role.find({ _id: { $in: membership.roleIds }, tenantId }).lean(),
    StaffMember.findOne({ tenantId, userId }, '_id').lean(),
    Student.findOne({ tenantId, userId }, '_id sectionId').lean(),
  ]);

  const context = {
    permissions: [...new Set(roles.flatMap((r) => r.permissions))],
    subjects: {
      ...(staff ? { staffId: staff._id.toString() } : {}),
      ...(student
        ? {
            studentId: student._id.toString(),
            sectionId: student.sectionId ? student.sectionId.toString() : null,
          }
        : {}),
    },
  };

  await redis.setex(cacheKey, CACHE_TTL, JSON.stringify(context));
  return context;
}

export async function resolvePermissions(userId, tenantId) {
  return (await resolveContext(userId, tenantId)).permissions;
}

/**
 * Drops the cached permission set for one member. Every membership or role
 * write must call this: the 60s TTL is fine for staleness, but not for a grant
 * an admin just made or — much worse — an access they just revoked.
 */
export async function invalidatePermissions(tenantId, userId) {
  await redis.del(`ctx:${tenantId}:${userId}`);
}

/**
 * Same, for every member of a tenant — used when a Role's permissions change,
 * which affects everyone holding it. SCAN rather than KEYS so this cannot block
 * Redis on a large keyspace.
 */
export async function invalidateTenantPermissions(tenantId) {
  const match = `ctx:${tenantId}:*`;
  let cursor = '0';
  do {
    const [next, keys] = await redis.scan(cursor, 'MATCH', match, 'COUNT', 100);
    cursor = next;
    if (keys.length) await redis.del(...keys);
  } while (cursor !== '0');
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
