import { Router } from 'express';
import { z } from 'zod';
import { ORG_TYPES } from '@rooted/shared/constants';
import { AuditLog } from '../models/AuditLog.js';
import { User } from '../models/User.js';
import { StaffMember } from '../models/StaffMember.js';
import { TenantMembership } from '../models/TenantMembership.js';
import {
  createInviteSchema,
  updateMemberRolesSchema,
  approveJoinRequestSchema,
  updateJoinPolicySchema,
} from '@rooted/shared/schemas';
import { authenticate } from '../middleware/authenticate.js';
import { validate } from '../middleware/validate.js';
import { requirePermission, invalidatePermissions } from '../middleware/requirePermission.js';
import { Role } from '../models/Role.js';
import { Student } from '../models/Student.js';
import { Invite } from '../models/Invite.js';
import { createInvite, revokeInvite, inviteUrlFor } from '../services/invite.service.js';
import {
  approveJoinRequest,
  rejectJoinRequest,
  rotateJoinCode,
  formatJoinCode,
} from '../services/joinRequest.service.js';
import { sendTenantInvite } from '../services/email.service.js';
import { markRead, getUnread, broadcastToRole } from '../services/notification.service.js';
import { auditLog } from '../services/audit.service.js';
import { blockToken } from '../services/auth.service.js';
import { getTenantKey, decrypt } from '../utils/fieldEncryption.js';
import { Tenant } from '../models/Tenant.js';
import { AppError } from '../middleware/errorHandler.js';

const router = Router();

router.use(authenticate);

router.get('/notifications', async (req, res, next) => {
  try {
    const notifications = await getUnread(req.user.sub, req.tenant._id);
    res.json(notifications);
  } catch (err) {
    next(err);
  }
});

router.patch('/notifications/:id/read', async (req, res, next) => {
  try {
    const notification = await markRead(req.params.id, req.user.sub);
    res.json(notification);
  } catch (err) {
    next(err);
  }
});

router.post('/broadcast', requirePermission('tenant:admin'), async (req, res, next) => {
  try {
    const { roleKey, title, body, link } = req.body;
    const count = await broadcastToRole(req.tenant._id, roleKey, title, body, link);

    await auditLog({
      actorId: req.user.sub,
      tenantId: req.tenant._id.toString(),
      action: 'notification.broadcast',
      target: { type: 'Notification', id: roleKey },
      after: { roleKey, title, count },
      ip: req.ip,
    });

    res.json({ sent: count });
  } catch (err) {
    next(err);
  }
});

router.get('/audit', requirePermission('audit:read'), async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Number(req.query.limit) || 50);
    const filter = { tenantId: req.tenant._id };
    if (req.query.actorId) filter.actorId = req.query.actorId;
    if (req.query.action) filter.action = req.query.action;
    if (req.query.from || req.query.to) {
      filter.at = {};
      if (req.query.from) filter.at.$gte = new Date(req.query.from);
      if (req.query.to) filter.at.$lte = new Date(req.query.to);
    }

    const [logs, total] = await Promise.all([
      AuditLog.find(filter)
        .sort({ at: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      AuditLog.countDocuments(filter),
    ]);

    res.json({ logs, total, page, pages: Math.ceil(total / limit) });
  } catch (err) {
    next(err);
  }
});

// ── Tenant Settings ───────────────────────────────────────────────────────────

router.get('/settings', async (req, res, next) => {
  try {
    // joinPolicy is withheld: this route has no permission check, so returning
    // req.tenant wholesale would hand the join code to every member. It is
    // exposed only through GET /tenant/join-policy, behind tenant:admin.
    const tenant = { ...req.tenant };
    delete tenant.joinPolicy;
    res.json(tenant);
  } catch (err) {
    next(err);
  }
});

const settingsUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  timezone: z.string().optional(),
  locale: z.string().optional(),
  currency: z.string().optional(),
  orgType: z.enum(ORG_TYPES).optional(),
});

router.patch('/settings', requirePermission('tenant:admin'), async (req, res, next) => {
  try {
    const updates = settingsUpdateSchema.parse(req.body);

    // orgType decides which modules exist and what a student is even called.
    // Changing it once there are students strands their records in modules that
    // disappear, so it is editable only while the organization is still empty —
    // which, with self-serve signup, is when a wrong choice gets noticed.
    if (updates.orgType && updates.orgType !== req.tenant.orgType) {
      const students = await Student.countDocuments({ tenantId: req.tenant._id });
      if (students > 0) {
        throw new AppError(
          'Organization type cannot be changed once students have been added',
          409
        );
      }
    }

    const tenant = await Tenant.findByIdAndUpdate(req.tenant._id, { $set: updates }, { new: true });
    if (!tenant) throw new AppError('Tenant not found', 404);
    res.json(tenant);
  } catch (err) {
    next(err);
  }
});

// ── GDPR Endpoints ────────────────────────────────────────────────────────────

router.get('/gdpr/export', async (req, res, next) => {
  try {
    const userId = req.user.sub;
    const tenantId = req.tenant._id;

    const user = await User.findById(userId).select('email lastLoginAt').lean();
    const staff = await StaffMember.findOne({ userId, tenantId }).lean();
    const memberships = await TenantMembership.find({ userId, tenantId }).lean();

    let staffData = null;
    if (staff) {
      const tenantKey = getTenantKey(tenantId.toString());
      let decryptedGovId = null;
      if (staff.governmentId) {
        try {
          decryptedGovId = decrypt(staff.governmentId, tenantKey);
        } catch {
          decryptedGovId = '[encrypted]';
        }
      }
      staffData = {
        firstName: staff.firstName,
        lastName: staff.lastName,
        phone: staff.phone,
        address: staff.address,
        designation: staff.designation,
        governmentId: decryptedGovId,
      };
    }

    const exportData = {
      exportedAt: new Date().toISOString(),
      user: {
        email: user?.email,
        lastLoginAt: user?.lastLoginAt,
      },
      staffProfile: staffData,
      memberships: memberships.map((m) => ({ roles: m.roleIds, status: m.status })),
    };

    res.setHeader('Content-Disposition', 'attachment; filename=my-data-export.json');
    res.setHeader('Content-Type', 'application/json');
    res.json(exportData);
  } catch (err) {
    next(err);
  }
});

const gdprDeleteSchema = z.object({ confirm: z.literal(true) });

router.delete('/gdpr/delete', async (req, res, next) => {
  try {
    gdprDeleteSchema.parse(req.body);

    const userId = req.user.sub;
    const tenantId = req.tenant._id;

    // Remove StaffMember record
    await StaffMember.deleteOne({ userId, tenantId });

    // Anonymize User record
    await User.updateOne(
      { _id: userId },
      {
        $set: {
          email: `deleted-${userId}@deleted.invalid`,
          lastLoginIp: null,
        },
      },
      { _bypassTenantScope: true }
    );

    // Block current access token
    if (req.token) {
      await blockToken(req.token, 15 * 60);
    }

    await auditLog({
      actorId: userId,
      tenantId: tenantId.toString(),
      action: 'gdpr.delete',
      target: { type: 'User', id: userId },
      ip: req.ip,
    });

    res.json({ message: 'Your data has been deleted.' });
  } catch (err) {
    next(err);
  }
});

// ── Members & invitations ────────────────────────────────────────────────────

/** True when this member is the only active holder of tenant:admin. */
async function isLastAdmin(tenantId, membershipId) {
  const adminRoles = await Role.find({ tenantId, permissions: 'tenant:admin' }, '_id').lean();
  if (!adminRoles.length) return false;
  const adminRoleIds = adminRoles.map((r) => r._id);

  const admins = await TenantMembership.find(
    { tenantId, status: 'active', roleIds: { $in: adminRoleIds } },
    '_id'
  ).lean();

  return admins.length === 1 && String(admins[0]._id) === String(membershipId);
}

router.get('/members', requirePermission('roles:read'), async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Number(req.query.limit) || 20);
    const filter = { tenantId: req.tenant._id };
    if (req.query.status) filter.status = req.query.status;

    const [members, total] = await Promise.all([
      TenantMembership.find(filter)
        .populate('userId', 'email username firstName lastName')
        .populate('roleIds', 'name templateKey')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      TenantMembership.countDocuments(filter),
    ]);

    res.json({ members, total, page, pages: Math.ceil(total / limit) });
  } catch (err) {
    next(err);
  }
});

router.patch(
  '/members/:id/roles',
  requirePermission('roles:write'),
  validate(updateMemberRolesSchema),
  async (req, res, next) => {
    try {
      const tenantId = req.tenant._id;
      const { roleIds } = req.body;

      const membership = await TenantMembership.findOne({ _id: req.params.id, tenantId });
      if (!membership) throw new AppError('Member not found', 404);

      const roles = await Role.find({ _id: { $in: roleIds }, tenantId }, '_id permissions').lean();
      if (roles.length !== roleIds.length) {
        throw new AppError('One or more roles do not belong to this organization', 400);
      }

      // Removing tenant:admin from the last admin locks the organization out of
      // its own settings, with no in-app way back.
      const keepsAdmin = roles.some((r) => r.permissions.includes('tenant:admin'));
      if (!keepsAdmin && (await isLastAdmin(tenantId, membership._id))) {
        throw new AppError('This is the last administrator — assign another first', 409);
      }

      const before = membership.roleIds.map(String);
      membership.roleIds = roleIds;
      await membership.save();

      await invalidatePermissions(tenantId, membership.userId);

      await auditLog({
        actorId: req.user.sub,
        tenantId: tenantId.toString(),
        action: 'member.roles_changed',
        target: { model: 'TenantMembership', id: membership._id },
        before: { roleIds: before },
        after: { roleIds },
        ip: req.ip,
      });

      res.json(membership);
    } catch (err) {
      next(err);
    }
  }
);

router.delete('/members/:id', requirePermission('roles:write'), async (req, res, next) => {
  try {
    const tenantId = req.tenant._id;
    const membership = await TenantMembership.findOne({ _id: req.params.id, tenantId });
    if (!membership) throw new AppError('Member not found', 404);

    if (String(membership.userId) === String(req.user.sub)) {
      throw new AppError('You cannot remove yourself', 400);
    }
    if (await isLastAdmin(tenantId, membership._id)) {
      throw new AppError('This is the last administrator — assign another first', 409);
    }

    await TenantMembership.deleteOne({ _id: membership._id, tenantId });
    await invalidatePermissions(tenantId, membership.userId);

    await auditLog({
      actorId: req.user.sub,
      tenantId: tenantId.toString(),
      action: 'member.removed',
      target: { model: 'TenantMembership', id: membership._id },
      before: { userId: membership.userId, roleIds: membership.roleIds },
      ip: req.ip,
    });

    res.json({ message: 'Member removed' });
  } catch (err) {
    next(err);
  }
});

router.post(
  '/invites',
  requirePermission('roles:write'),
  validate(createInviteSchema),
  async (req, res, next) => {
    try {
      const { email, roleIds } = req.body;
      const { invite, token } = await createInvite({
        tenantId: req.tenant._id,
        email,
        roleIds,
        invitedBy: req.user.sub,
      });

      await sendTenantInvite(email, req.tenant.name, inviteUrlFor(req.tenant, token));

      await auditLog({
        actorId: req.user.sub,
        tenantId: req.tenant._id.toString(),
        action: 'invite.sent',
        target: { model: 'Invite', id: invite._id },
        after: { email, roleIds },
        ip: req.ip,
      });

      // The raw token is never returned — it exists only in the email.
      res.status(201).json({
        _id: invite._id,
        email: invite.email,
        roleIds: invite.roleIds,
        status: invite.status,
        expiresAt: invite.expiresAt,
      });
    } catch (err) {
      next(err);
    }
  }
);

router.get('/invites', requirePermission('roles:read'), async (req, res, next) => {
  try {
    const filter = { tenantId: req.tenant._id };
    filter.status = req.query.status ?? 'pending';

    const invites = await Invite.find(filter, '-tokenHash')
      .populate('invitedBy', 'email firstName lastName')
      .populate('roleIds', 'name')
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();

    res.json(invites);
  } catch (err) {
    next(err);
  }
});

router.delete('/invites/:id', requirePermission('roles:write'), async (req, res, next) => {
  try {
    const invite = await revokeInvite(req.tenant._id, req.params.id);

    await auditLog({
      actorId: req.user.sub,
      tenantId: req.tenant._id.toString(),
      action: 'invite.revoked',
      target: { model: 'Invite', id: invite._id },
      after: { email: invite.email },
      ip: req.ip,
    });

    res.json({ message: 'Invitation revoked' });
  } catch (err) {
    next(err);
  }
});

// ── Join policy & requests ───────────────────────────────────────────────────

router.get('/join-policy', requirePermission('tenant:admin'), async (req, res, next) => {
  try {
    const policy = req.tenant.joinPolicy ?? {};
    res.json({
      mode: policy.mode ?? 'closed',
      requireApproval: policy.requireApproval ?? true,
      defaultRoleIds: policy.defaultRoleIds ?? [],
      codeExpiresAt: policy.codeExpiresAt ?? null,
      code: formatJoinCode(policy.code),
    });
  } catch (err) {
    next(err);
  }
});

router.put(
  '/join-policy',
  requirePermission('tenant:admin'),
  validate(updateJoinPolicySchema),
  async (req, res, next) => {
    try {
      const { mode, requireApproval, defaultRoleIds, codeExpiresAt } = req.body;
      const tenantId = req.tenant._id;

      if (defaultRoleIds?.length) {
        const roles = await Role.find({ _id: { $in: defaultRoleIds }, tenantId }, '_id').lean();
        if (roles.length !== defaultRoleIds.length) {
          throw new AppError('One or more roles do not belong to this organization', 400);
        }
      }
      // Auto-approval hands out roles with nobody in the loop, so it cannot be
      // switched on without saying which roles.
      if (requireApproval === false && !defaultRoleIds?.length) {
        throw new AppError('Choose the roles auto-approved members receive', 400);
      }

      // Opening the door needs a code to open it with. Allocate it *before*
      // the update below, because rotation clears codeExpiresAt and would
      // otherwise wipe an expiry set in this same request.
      if (mode === 'code' && !req.tenant.joinPolicy?.code) {
        await rotateJoinCode(tenantId);
      }

      const set = { 'joinPolicy.mode': mode };
      if (requireApproval !== undefined) set['joinPolicy.requireApproval'] = requireApproval;
      if (defaultRoleIds !== undefined) set['joinPolicy.defaultRoleIds'] = defaultRoleIds;
      if (codeExpiresAt !== undefined) set['joinPolicy.codeExpiresAt'] = codeExpiresAt;

      const tenant = await Tenant.findByIdAndUpdate(tenantId, { $set: set }, { new: true });
      const code = tenant.joinPolicy?.code;

      await auditLog({
        actorId: req.user.sub,
        tenantId: tenantId.toString(),
        action: 'tenant.join_policy_changed',
        after: { mode, requireApproval, defaultRoleIds },
        ip: req.ip,
      });

      res.json({
        mode: tenant.joinPolicy.mode,
        requireApproval: tenant.joinPolicy.requireApproval,
        defaultRoleIds: tenant.joinPolicy.defaultRoleIds,
        codeExpiresAt: tenant.joinPolicy.codeExpiresAt ?? null,
        code: formatJoinCode(code),
      });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/join-policy/rotate-code',
  requirePermission('tenant:admin'),
  async (req, res, next) => {
    try {
      const { code } = await rotateJoinCode(req.tenant._id);

      await auditLog({
        actorId: req.user.sub,
        tenantId: req.tenant._id.toString(),
        action: 'tenant.join_code_rotated',
        ip: req.ip,
      });

      res.json({ code });
    } catch (err) {
      next(err);
    }
  }
);

router.get('/join-requests', requirePermission('roles:write'), async (req, res, next) => {
  try {
    const requests = await TenantMembership.find({ tenantId: req.tenant._id, status: 'pending' })
      .populate('userId', 'email username firstName lastName')
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();

    res.json(requests);
  } catch (err) {
    next(err);
  }
});

router.post(
  '/join-requests/:id/approve',
  requirePermission('roles:write'),
  validate(approveJoinRequestSchema),
  async (req, res, next) => {
    try {
      const membership = await approveJoinRequest({
        tenantId: req.tenant._id,
        membershipId: req.params.id,
        roleIds: req.body.roleIds,
        approvedBy: req.user.sub,
      });

      await auditLog({
        actorId: req.user.sub,
        tenantId: req.tenant._id.toString(),
        action: 'join_request.approved',
        target: { model: 'TenantMembership', id: membership._id },
        after: { userId: membership.userId, roleIds: membership.roleIds },
        ip: req.ip,
      });

      res.json(membership);
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/join-requests/:id/reject',
  requirePermission('roles:write'),
  async (req, res, next) => {
    try {
      const membership = await rejectJoinRequest({
        tenantId: req.tenant._id,
        membershipId: req.params.id,
        rejectedBy: req.user.sub,
      });

      await auditLog({
        actorId: req.user.sub,
        tenantId: req.tenant._id.toString(),
        action: 'join_request.rejected',
        target: { model: 'TenantMembership', id: membership._id },
        after: { userId: membership.userId },
        ip: req.ip,
      });

      res.json({ message: 'Request rejected' });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
