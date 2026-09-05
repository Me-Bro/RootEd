import { Invite } from '../models/Invite.js';
import { User } from '../models/User.js';
import { Role } from '../models/Role.js';
import { Tenant } from '../models/Tenant.js';
import { TenantMembership } from '../models/TenantMembership.js';
import { AppError } from '../middleware/errorHandler.js';
import { invalidatePermissions } from '../middleware/requirePermission.js';
import { generateToken, hashToken } from './auth.service.js';
import { env, getPortalHost } from '../config/env.js';

export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Where an invite link should land: the tenant's own host, else the portal. */
export function inviteUrlFor(tenant, token) {
  const host = tenant.subdomain ? `${tenant.subdomain}.${env.APP_DOMAIN}` : getPortalHost();
  return `https://${host}/accept-invite?token=${token}`;
}

/**
 * Creates or rotates the pending invite for an address. Re-inviting the same
 * person issues a fresh token against the same row rather than leaving two
 * valid tokens in two inboxes.
 *
 * Returns the raw token, which is the only place it ever exists un-hashed.
 */
export async function createInvite({ tenantId, email, roleIds, invitedBy }) {
  // Roles are per-tenant documents. Accepting an id without checking it belongs
  // to *this* tenant would let an admin graft another tenant's role onto their
  // own member.
  const roles = await Role.find({ _id: { $in: roleIds }, tenantId }, '_id').lean();
  if (roles.length !== roleIds.length) {
    throw new AppError('One or more roles do not belong to this organization', 400);
  }

  const invitee = await User.findOne({ email }, '_id').lean();
  if (invitee) {
    const existing = await TenantMembership.findOne(
      { tenantId, userId: invitee._id },
      'status'
    ).lean();
    if (existing?.status === 'active') {
      throw new AppError('That person is already a member', 409);
    }
    // Re-inviting is not a way to undo a suspension — see acceptInvite().
    if (existing?.status === 'suspended') {
      throw new AppError('That account is suspended for this organization', 403);
    }
  }

  const token = generateToken();
  const invite = await Invite.findOneAndUpdate(
    { tenantId, email, status: 'pending' },
    {
      $set: {
        roleIds,
        invitedBy,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + INVITE_TTL_MS),
      },
      $setOnInsert: { tenantId, email, status: 'pending' },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  return { invite, token };
}

/**
 * Redeems an invite for an authenticated user.
 *
 * The token is bound to the invited address: without that check the link is a
 * bearer credential and whoever holds it joins the organization.
 */
export async function acceptInvite({ token, user }) {
  const invite = await Invite.findOne(
    { tokenHash: hashToken(token) },
    null,
    // Acceptance happens on the portal host, where there is no tenant context —
    // the token is what identifies the tenant.
    { _bypassTenantScope: true }
  );
  if (!invite) throw new AppError('Invalid invitation link', 400);

  if (invite.status === 'accepted') {
    // Re-opening your own acceptance link is harmless; anyone else's is not.
    if (String(invite.acceptedUserId) === String(user._id)) {
      return { tenantId: invite.tenantId, alreadyAccepted: true };
    }
    throw new AppError('This invitation has already been used', 410);
  }
  if (invite.status === 'revoked') throw new AppError('This invitation was revoked', 410);
  if (invite.expiresAt < new Date()) {
    invite.status = 'expired';
    await invite.save({ _bypassTenantScope: true });
    throw new AppError('This invitation has expired', 410);
  }

  if (invite.email !== user.email) {
    throw new AppError('This invitation was sent to a different email address', 403);
  }

  const tenant = await Tenant.findOne({ _id: invite.tenantId, status: 'active' }).lean();
  if (!tenant) throw new AppError('That organization is not available', 404);

  const existing = await TenantMembership.findOne({
    tenantId: invite.tenantId,
    userId: user._id,
  });

  // An invite must never launder a suspension. Without this, an admin who
  // suspended someone could be socially engineered into re-inviting them, and
  // the suspension would silently evaporate.
  if (existing?.status === 'suspended') {
    throw new AppError('This account is suspended for that organization', 403);
  }

  if (existing) {
    existing.status = 'active';
    existing.roleIds = invite.roleIds;
    existing.joinMethod = 'invite';
    existing.invitedBy = invite.invitedBy;
    await existing.save();
  } else {
    await TenantMembership.create({
      tenantId: invite.tenantId,
      userId: user._id,
      roleIds: invite.roleIds,
      status: 'active',
      joinMethod: 'invite',
      invitedBy: invite.invitedBy,
    });
  }

  // Redeeming a token that was mailed to this address *is* proof of control of
  // it, so an unverified account that arrived via an invite does not also have
  // to chase a separate verification email.
  if (!user.emailVerified) {
    await User.updateOne(
      { _id: user._id },
      {
        emailVerified: true,
        ...(user.status === 'pending_verification' ? { status: 'active' } : {}),
      },
      { _bypassTenantScope: true }
    );
  }

  invite.status = 'accepted';
  invite.acceptedUserId = user._id;
  invite.acceptedAt = new Date();
  await invite.save({ _bypassTenantScope: true });

  await invalidatePermissions(invite.tenantId, user._id);

  return { tenantId: invite.tenantId, alreadyAccepted: false };
}

export async function revokeInvite(tenantId, inviteId) {
  const invite = await Invite.findOneAndUpdate(
    { _id: inviteId, tenantId, status: 'pending' },
    { $set: { status: 'revoked' } },
    { new: true }
  );
  if (!invite) throw new AppError('No pending invitation found', 404);
  return invite;
}
