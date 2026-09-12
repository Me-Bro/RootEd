import crypto from 'node:crypto';
import { User } from '../models/User.js';
import { TenantMembership } from '../models/TenantMembership.js';
import { Tenant } from '../models/Tenant.js';
import { Role } from '../models/Role.js';
import { hashPassword, revokeUserSessions } from './auth.service.js';
import { AppError } from '../middleware/errorHandler.js';

/**
 * Account deletion, as required by Google Play's account-deletion policy for
 * any app that offers account creation (RootEd does, at /register).
 *
 * It is an anonymise-and-tombstone, not a hard delete, and that is deliberate.
 * A school's attendance registers, fee receipts and payroll runs are the
 * *tenant's* records, not the individual's, and several carry statutory
 * retention duties — dropping the User row would orphan them and break the
 * audit trail the platform is built around. So everything that identifies the
 * person goes, and the row survives only as an unusable reference target.
 *
 * What is removed: name, phone, avatar, username, email (replaced by a
 * per-account tombstone), password, MFA secret, every pending token, and every
 * organization seat.
 * What remains: tenant-owned academic and financial records, and AuditLog
 * entries — which are immutable by design and already expire on a 90-day TTL.
 */

/** A random, unusable credential — passwordHash is required and cannot be unset. */
async function deadPasswordHash() {
  return hashPassword(crypto.randomBytes(32).toString('hex'));
}

/**
 * Organizations where this person is the last active tenant_admin.
 *
 * Deleting them would leave the org with nobody who can invite, assign roles or
 * manage billing, and no self-service way back in — the same unrecoverable
 * state tenant.service.js guards against at creation time. Callers must refuse
 * the deletion and tell the user which orgs to hand over first.
 */
export async function soleAdminTenants(userId) {
  const memberships = await TenantMembership.find(
    { userId, status: 'active' },
    'tenantId roleIds',
    { _bypassTenantScope: true }
  ).lean();
  if (memberships.length === 0) return [];

  const blocking = [];
  for (const membership of memberships) {
    const tenant = await Tenant.findOne(
      { _id: membership.tenantId, status: 'active' },
      '_id name'
    ).lean();
    // A suspended or archived org has no one to lock out.
    if (!tenant) continue;

    const adminRole = await Role.findOne(
      { tenantId: membership.tenantId, templateKey: 'tenant_admin' },
      '_id',
      { _bypassTenantScope: true }
    ).lean();
    if (!adminRole) continue;

    const isAdmin = (membership.roleIds ?? []).some((id) => id.equals(adminRole._id));
    if (!isAdmin) continue;

    const otherAdmins = await TenantMembership.countDocuments(
      {
        tenantId: membership.tenantId,
        status: 'active',
        roleIds: adminRole._id,
        userId: { $ne: userId },
      },
      { _bypassTenantScope: true }
    );
    if (otherAdmins === 0) blocking.push(tenant.name);
  }
  return blocking;
}

/**
 * Scrubs the account. The caller is responsible for having verified the
 * password first — this function does not re-check it.
 *
 * @throws {AppError} 409 when the user is the last admin of an active org.
 */
export async function deleteUserAccount(user) {
  if (user.systemRole) {
    // Platform operator accounts are not self-service. Removing the last
    // super_admin would leave nobody able to reach /admin at all.
    throw new AppError(
      'Platform administrator accounts cannot be deleted from here. Contact support.',
      403
    );
  }

  const blocking = await soleAdminTenants(user._id);
  if (blocking.length > 0) {
    throw new AppError(
      `You are the only administrator of ${blocking.join(', ')}. ` +
        'Make someone else an administrator there, or delete the organization, then try again.',
      409
    );
  }

  // Seats go first: if the scrub below fails, the account is still intact and
  // the user can retry, rather than being left nameless but still a member.
  await TenantMembership.deleteMany({ userId: user._id }, { _bypassTenantScope: true });

  await User.updateOne(
    { _id: user._id },
    {
      $set: {
        // Unique index on email still has to be satisfied, so the address
        // becomes a per-account tombstone on a domain that can never receive
        // mail (RFC 2606 reserves .invalid).
        email: `deleted+${user._id}@deleted.invalid`,
        emailVerified: false,
        status: 'deleted',
        passwordHash: await deadPasswordHash(),
        mfaEnabled: false,
        systemRole: null,
      },
      // $unset rather than null: usernameLower carries a sparse unique index,
      // and a null would be indexed, so the second deleted account would
      // collide with the first.
      $unset: {
        username: '',
        usernameLower: '',
        usernameChangedAt: '',
        firstName: '',
        lastName: '',
        phone: '',
        avatarKey: '',
        mfaSecret: '',
        pendingEmail: '',
        pendingEmailToken: '',
        pendingEmailExpires: '',
        emailVerificationToken: '',
        emailVerificationExpires: '',
        passwordResetToken: '',
        passwordResetExpires: '',
        lastLoginIp: '',
      },
    }
  );

  // Kills every live access token as well as the refresh cookie's usefulness.
  await revokeUserSessions(user._id);
}
