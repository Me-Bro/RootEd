import crypto from 'crypto';
import argon2 from 'argon2';
import { User } from '../models/User.js';
import { TenantMembership } from '../models/TenantMembership.js';
import { StaffMember } from '../models/StaffMember.js';
import { LeaveType } from '../models/LeaveType.js';
import { LeaveBalance } from '../models/LeaveBalance.js';
import { AppError } from '../middleware/errorHandler.js';

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
