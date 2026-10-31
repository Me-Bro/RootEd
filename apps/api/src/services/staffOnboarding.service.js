import crypto from 'crypto';
import argon2 from 'argon2';
import { User } from '../models/User.js';
import { TenantMembership } from '../models/TenantMembership.js';
import { StaffMember } from '../models/StaffMember.js';
import { LeaveType } from '../models/LeaveType.js';
import { LeaveBalance } from '../models/LeaveBalance.js';
import { AppError } from '../middleware/errorHandler.js';
import { provisionStaffAccount } from './identity.service.js';

export async function provisionStaffUser({ tenantId, email }) {
  let user = await User.findOne({ email });
  if (!user) {
    user = await User.create({
      email,
      passwordHash: await argon2.hash(crypto.randomUUID()),
      status: 'invited',
    });
  }

  const membership = await TenantMembership.findOne({ tenantId, userId: user._id });
  if (!membership) {
    await TenantMembership.create({ tenantId, userId: user._id, roleIds: [], status: 'invited' });
  }

  return user._id;
}

// With roleIds, someone new gets a login they can claim (active membership with those
// roles, set-password email) instead of the role-less invited stub provisionStaffUser
// leaves behind. Someone who is already a member keeps the roles they have.
export async function provisionStaffLogin({
  tenant,
  email,
  firstName,
  lastName,
  roleIds,
  enqueue,
}) {
  if (!roleIds?.length) return;
  const user = await User.findOne({ email }, '_id').lean();
  if (user && (await TenantMembership.exists({ tenantId: tenant._id, userId: user._id }))) return;

  const { user: created, reason } = await provisionStaffAccount({
    tenant,
    email,
    firstName,
    lastName,
    roleIds,
    enqueue,
  });
  if (!created) throw new AppError(`Could not add this person: ${reason}`, 409);
}

export async function assertStaffMemberNotLinked(tenantId, userId) {
  const existing = await StaffMember.findOne({ tenantId, userId }).lean();
  if (existing) {
    throw new AppError('A staff member is already linked to this email for this school', 409);
  }
}

export async function setStaffAccessStatus(tenantId, userId, status) {
  await TenantMembership.findOneAndUpdate({ tenantId, userId }, { $set: { status } });
}

export async function seedLeaveBalancesForStaff(tenantId, staffId, year) {
  const leaveTypes = await LeaveType.find({ tenantId }).lean();
  if (!leaveTypes.length) return;

  await LeaveBalance.bulkWrite(
    leaveTypes.map((leaveType) => ({
      updateOne: {
        filter: { tenantId, staffId, leaveTypeId: leaveType._id, year },
        update: { $setOnInsert: { total: leaveType.maxDaysPerYear, used: 0 } },
        upsert: true,
      },
    }))
  );
}
