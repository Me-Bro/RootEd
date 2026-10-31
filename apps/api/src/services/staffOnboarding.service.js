import crypto from 'crypto';
import argon2 from 'argon2';
import { User } from '../models/User.js';
import { TenantMembership } from '../models/TenantMembership.js';
import { StaffMember } from '../models/StaffMember.js';
import { LeaveType } from '../models/LeaveType.js';
import { LeaveBalance } from '../models/LeaveBalance.js';
import { AppError } from '../middleware/errorHandler.js';
import { provisionStaffAccount, sendClaimEmail } from './identity.service.js';

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

// How a staff member's login looks to an administrator: none (cannot sign in: no
// account, no role, or the stub provisionStaffUser leaves), pending (has the
// set-password link), active, suspended.
export function staffLoginState(user, membership) {
  if (membership?.status === 'suspended' || user?.status === 'suspended') return 'suspended';
  if (!user || !membership?.roleIds?.length || user.status === 'invited') return 'none';
  return user.status === 'pending_claim' ? 'pending' : 'active';
}

// userId -> state, for the staff directory.
export async function staffLoginStates(tenantId, members) {
  const userIds = members.map((m) => m.userId).filter(Boolean);
  if (!userIds.length) return new Map();
  const [users, memberships] = await Promise.all([
    User.find({ _id: { $in: userIds } }, 'status').lean(),
    TenantMembership.find({ tenantId, userId: { $in: userIds } }, 'userId status roleIds').lean(),
  ]);
  const userById = new Map(users.map((u) => [String(u._id), u]));
  const membershipByUser = new Map(memberships.map((m) => [String(m.userId), m]));
  return new Map(
    userIds.map((id) => [
      String(id),
      staffLoginState(userById.get(String(id)), membershipByUser.get(String(id))),
    ])
  );
}

// Gives a staff member who cannot sign in (see staffLoginState) the roles they
// lack and, if they never set a password, a set-password link. Returns whether a
// link was mailed.
export async function giveStaffLogin({ tenant, staff, roleIds, enqueue }) {
  const [user, membership] = await Promise.all([
    staff.userId ? User.findById(staff.userId, 'email status') : null,
    TenantMembership.findOne({ tenantId: tenant._id, userId: staff.userId }),
  ]);
  if (!user || !membership) throw new AppError('This staff member has no account', 409);
  if (staffLoginState(user, membership) !== 'none') {
    throw new AppError('This staff member already has a login', 409);
  }

  membership.roleIds = roleIds;
  membership.status = 'active';
  await membership.save();

  if (user.status !== 'invited') return false;
  user.status = 'pending_claim';
  await user.save();
  return sendClaimEmail({ tenant, user, email: user.email, enqueue });
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
