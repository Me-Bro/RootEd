import { Router } from 'express';
import { z } from 'zod';
import { AuditLog } from '../models/AuditLog.js';
import { User } from '../models/User.js';
import { StaffMember } from '../models/StaffMember.js';
import { TenantMembership } from '../models/TenantMembership.js';
import { authenticate } from '../middleware/authenticate.js';
import { requirePermission } from '../middleware/requirePermission.js';
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
      AuditLog.find(filter).sort({ at: -1 }).skip((page - 1) * limit).limit(limit).lean(),
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
    res.json(req.tenant);
  } catch (err) {
    next(err);
  }
});

const settingsUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  timezone: z.string().optional(),
  locale: z.string().optional(),
  currency: z.string().optional(),
});

router.patch('/settings', requirePermission('tenant:admin'), async (req, res, next) => {
  try {
    const updates = settingsUpdateSchema.parse(req.body);
    const tenant = await Tenant.findByIdAndUpdate(
      req.tenant._id,
      { $set: updates },
      { new: true }
    );
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

export default router;
