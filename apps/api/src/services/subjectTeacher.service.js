import { TenantMembership } from '../models/TenantMembership.js';
import { Role } from '../models/Role.js';
import { AppError } from '../middleware/errorHandler.js';

/**
 * A teacher is an active member of this college holding any role but the
 * student one. teacherId in a request is only an ObjectId, so without this an
 * admin could name a user from another college, or a student.
 */
export async function assertTeacher(tenantId, userId) {
  const membership = await TenantMembership.findOne(
    { tenantId, userId, status: 'active' },
    'roleIds'
  ).lean();
  const roles = membership
    ? await Role.find({ _id: { $in: membership.roleIds }, tenantId }, 'templateKey').lean()
    : [];
  if (!roles.some((r) => r.templateKey !== 'student')) {
    throw new AppError('Teacher not found', 404);
  }
}
