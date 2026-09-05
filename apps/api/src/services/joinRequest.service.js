import crypto from 'crypto';
import { JOIN_CODE_ALPHABET, JOIN_CODE_LENGTH, JOIN_CODE_PREFIX } from '@rooted/shared/constants';
import { normalizeJoinCode } from '@rooted/shared/utils';
import { Tenant } from '../models/Tenant.js';
import { Role } from '../models/Role.js';
import { TenantMembership } from '../models/TenantMembership.js';
import { AppError } from '../middleware/errorHandler.js';
import { invalidatePermissions } from '../middleware/requirePermission.js';

/** How long a rejected applicant must wait before asking the same org again. */
export const REJECTED_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;

/** `RTED-XXXXX-XXXXX` — grouped for reading aloud and copying off a board. */
export function generateJoinCode() {
  const bytes = crypto.randomBytes(JOIN_CODE_LENGTH);
  const chars = Array.from(bytes, (b) => JOIN_CODE_ALPHABET[b % JOIN_CODE_ALPHABET.length]);
  const body = chars.join('');
  const half = JOIN_CODE_LENGTH / 2;
  return `${JOIN_CODE_PREFIX}-${body.slice(0, half)}-${body.slice(half)}`;
}

export function formatJoinCode(stored) {
  if (!stored) return null;
  const half = Math.ceil(stored.length / 2);
  return `${JOIN_CODE_PREFIX}-${stored.slice(0, half)}-${stored.slice(half)}`;
}

/** Resolves a typed code to an active tenant that is currently accepting them. */
export async function tenantForJoinCode(rawCode) {
  const code = normalizeJoinCode(rawCode);
  if (!code) throw new AppError('Enter a join code', 400);

  const tenant = await Tenant.findOne({ 'joinPolicy.code': code, status: 'active' }).lean();

  // One message for "no such code", "that organization is closed" and "the code
  // expired". Distinguishing them turns this into a code oracle.
  const unusable =
    !tenant ||
    tenant.joinPolicy?.mode !== 'code' ||
    (tenant.joinPolicy?.codeExpiresAt && tenant.joinPolicy.codeExpiresAt < new Date());
  if (unusable) throw new AppError('That join code is not valid', 404);

  return tenant;
}

export async function rotateJoinCode(tenantId) {
  // Retry on the (vanishingly unlikely) unique-index collision rather than
  // handing the caller a 500.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const display = generateJoinCode();
    const stored = normalizeJoinCode(display);
    try {
      const tenant = await Tenant.findByIdAndUpdate(
        tenantId,
        {
          $set: { 'joinPolicy.code': stored },
          // A rotated code must not inherit the previous one's expiry — an
          // expiry already in the past would hand the admin a code that is
          // dead the moment it is displayed.
          $unset: { 'joinPolicy.codeExpiresAt': '' },
        },
        { new: true }
      );
      if (!tenant) throw new AppError('Tenant not found', 404);
      return { tenant, code: formatJoinCode(stored) };
    } catch (err) {
      if (err.code !== 11000) throw err;
    }
  }
  throw new AppError('Could not allocate a join code, try again', 500);
}

/**
 * Records a request to join. Never grants access directly unless the tenant has
 * explicitly turned approval off.
 *
 * The prior-membership branches are the security surface here: a membership row
 * already exists for suspended and rejected people, and letting a join code
 * overwrite it would undo an administrator's decision.
 */
export async function submitJoinRequest({ tenant, user, note }) {
  const existing = await TenantMembership.findOne({ tenantId: tenant._id, userId: user._id });

  if (existing) {
    if (existing.status === 'active') {
      throw new AppError('You are already a member of that organization', 409);
    }
    // The one that matters: without it, a suspended member types the join code
    // and is back in.
    if (existing.status === 'suspended') {
      throw new AppError('You cannot rejoin that organization', 403);
    }
    if (existing.status === 'rejected') {
      const since = existing.rejectedAt?.getTime() ?? 0;
      if (Date.now() - since < REJECTED_COOLDOWN_MS) {
        throw new AppError('You cannot rejoin that organization', 403);
      }
    }
    if (existing.status === 'pending') {
      return { membership: existing, created: false, autoApproved: false };
    }
  }

  const autoApprove = tenant.joinPolicy?.requireApproval === false;
  const defaultRoleIds = tenant.joinPolicy?.defaultRoleIds ?? [];

  const update = {
    // A pending member holds no roles at all, so even if the status filter were
    // ever bypassed, resolvePermissions() returns an empty set.
    roleIds: autoApprove ? defaultRoleIds : [],
    status: autoApprove ? 'active' : 'pending',
    joinMethod: 'join_code',
    requestNote: note,
    ...(autoApprove ? { approvedAt: new Date() } : {}),
  };

  const membership = await TenantMembership.findOneAndUpdate(
    { tenantId: tenant._id, userId: user._id },
    {
      $set: update,
      $setOnInsert: { tenantId: tenant._id, userId: user._id },
      // $set with undefined is a no-op in Mongoose, so clearing a previous
      // rejection needs $unset or the stale timestamp survives the reapply.
      $unset: { rejectedAt: '' },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  if (autoApprove) await invalidatePermissions(tenant._id, user._id);

  return { membership, created: !existing, autoApproved: autoApprove };
}

export async function approveJoinRequest({ tenantId, membershipId, roleIds, approvedBy }) {
  const membership = await TenantMembership.findOne({
    _id: membershipId,
    tenantId,
    status: 'pending',
  });
  if (!membership) throw new AppError('No pending request found', 404);

  const roles = await Role.find({ _id: { $in: roleIds }, tenantId }, '_id').lean();
  if (roles.length !== roleIds.length) {
    throw new AppError('One or more roles do not belong to this organization', 400);
  }

  membership.status = 'active';
  membership.roleIds = roleIds;
  membership.approvedBy = approvedBy;
  membership.approvedAt = new Date();
  await membership.save();

  await invalidatePermissions(tenantId, membership.userId);
  return membership;
}

export async function rejectJoinRequest({ tenantId, membershipId, rejectedBy }) {
  const membership = await TenantMembership.findOne({
    _id: membershipId,
    tenantId,
    status: 'pending',
  });
  if (!membership) throw new AppError('No pending request found', 404);

  // Rejected rather than deleted: a deleted row is an open invitation to
  // resubmit immediately, and the cooldown needs somewhere to live.
  membership.status = 'rejected';
  membership.roleIds = [];
  membership.approvedBy = rejectedBy;
  membership.rejectedAt = new Date();
  await membership.save();

  await invalidatePermissions(tenantId, membership.userId);
  return membership;
}
