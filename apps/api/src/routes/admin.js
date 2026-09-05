import { Router } from 'express';
import { z } from 'zod';
import { ORG_TYPES, PLANS, DEFAULT_PLAN } from '@rooted/shared/constants';
import { authenticate, requireSystemRole } from '../middleware/authenticate.js';
import { AppError } from '../middleware/errorHandler.js';
import { Tenant } from '../models/Tenant.js';
import { AuditLog } from '../models/AuditLog.js';
import { RequestLog } from '../models/RequestLog.js';
import { TenantMembership } from '../models/TenantMembership.js';
import {
  createTenant,
  suspendTenant,
  archiveTenant,
  restoreTenant,
} from '../services/tenant.service.js';
import { signAccessToken } from '../services/auth.service.js';
import { auditLog } from '../services/audit.service.js';
import { getFlags, toggleFlag } from '../services/featureFlag.service.js';
import { calculateFinalPrice, DISCOUNT_RATES } from '../services/billing.service.js';

const router = Router();

router.use(authenticate, requireSystemRole('super_admin'));

const createTenantSchema = z.object({
  name: z.string().min(2),
  subdomain: z.preprocess(
    (v) => (v === '' ? undefined : v),
    z
      .string()
      .min(2)
      .regex(/^[a-z0-9-]+$/)
      .optional()
  ),
  plan: z.enum(PLANS).default(DEFAULT_PLAN),
  orgType: z.enum(ORG_TYPES).default('school'),
  adminEmail: z.string().email(),
  adminPassword: z.string().min(8).optional(),
  locale: z.string().default('en'),
  timezone: z.string().default('Asia/Kolkata'),
  currency: z.string().default('INR'),
});

router.post('/tenants', async (req, res, next) => {
  try {
    const data = createTenantSchema.parse(req.body);
    const tenant = await createTenant(data);
    delete data.adminPassword; // don't leak password in audit
    await auditLog({
      actorId: req.user.sub,
      action: 'tenant.created',
      target: { model: 'Tenant', id: tenant._id },
      after: tenant,
      ip: req.ip,
    });
    res.status(201).json(tenant);
  } catch (err) {
    next(err);
  }
});

router.get('/tenants', async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Number(req.query.limit) || 20);
    const filter = {};
    if (req.query.status) filter.status = req.query.status;

    const [tenants, total] = await Promise.all([
      Tenant.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Tenant.countDocuments(filter),
    ]);

    res.json({ tenants, total, page, pages: Math.ceil(total / limit) });
  } catch (err) {
    next(err);
  }
});

router.get('/tenants/:id', async (req, res, next) => {
  try {
    const tenant = await Tenant.findById(req.params.id).lean();
    if (!tenant) return res.status(404).json({ error: 'Tenant not found' });
    res.json(tenant);
  } catch (err) {
    next(err);
  }
});

router.post('/tenants/:id/impersonate', async (req, res, next) => {
  try {
    const tenant = await Tenant.findById(req.params.id).lean();
    if (!tenant) return res.status(404).json({ error: 'Tenant not found' });
    if (tenant.status !== 'active') throw new AppError('Tenant is not active', 400);

    const accessToken = signAccessToken({
      sub: req.user.sub,
      systemRole: req.user.systemRole,
      impersonatedTenantId: tenant._id.toString(),
    });

    await auditLog({
      actorId: req.user.sub,
      action: 'tenant.impersonation.started',
      tenantId: tenant._id,
      target: { model: 'Tenant', id: tenant._id },
      ip: req.ip,
    });

    res.json({ accessToken, subdomain: tenant.subdomain });
  } catch (err) {
    next(err);
  }
});

router.get('/tenants/:id/members', async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Number(req.query.limit) || 20);
    const filter = { tenantId: req.params.id };

    const [members, total] = await Promise.all([
      TenantMembership.find(filter, null, { _bypassTenantScope: true })
        .populate('userId', 'email firstName lastName')
        .populate('roleIds', 'name')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      TenantMembership.countDocuments(filter, { _bypassTenantScope: true }),
    ]);

    res.json({ members, total, page, pages: Math.ceil(total / limit) });
  } catch (err) {
    next(err);
  }
});

router.get('/tenants/:id/audit', async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Number(req.query.limit) || 50);
    const filter = { tenantId: req.params.id };
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

router.patch('/tenants/:id/suspend', async (req, res, next) => {
  try {
    const tenant = await suspendTenant(req.params.id);
    await auditLog({
      actorId: req.user.sub,
      action: 'tenant.suspended',
      target: { model: 'Tenant', id: tenant._id },
      ip: req.ip,
    });
    res.json(tenant);
  } catch (err) {
    next(err);
  }
});

router.patch('/tenants/:id/archive', async (req, res, next) => {
  try {
    const tenant = await archiveTenant(req.params.id);
    await auditLog({
      actorId: req.user.sub,
      action: 'tenant.archived',
      target: { model: 'Tenant', id: tenant._id },
      ip: req.ip,
    });
    res.json(tenant);
  } catch (err) {
    next(err);
  }
});

router.patch('/tenants/:id/restore', async (req, res, next) => {
  try {
    const tenant = await restoreTenant(req.params.id);
    await auditLog({
      actorId: req.user.sub,
      action: 'tenant.restored',
      target: { model: 'Tenant', id: tenant._id },
      ip: req.ip,
    });
    res.json(tenant);
  } catch (err) {
    next(err);
  }
});

router.get('/audit', async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Number(req.query.limit) || 50);
    const filter = {};
    if (req.query.tenantId) filter.tenantId = req.query.tenantId;
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

router.get('/request-logs', async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Number(req.query.limit) || 50);
    const filter = {};
    if (req.query.tenantId) filter.tenantId = req.query.tenantId;
    if (req.query.module) filter.module = req.query.module;
    if (req.query.ip) filter.ip = req.query.ip;
    if (req.query.userEmail) filter.userEmail = req.query.userEmail;
    if (req.query.statusCode) filter.statusCode = Number(req.query.statusCode);
    if (req.query.from || req.query.to) {
      filter.at = {};
      if (req.query.from) filter.at.$gte = new Date(req.query.from);
      if (req.query.to) filter.at.$lte = new Date(req.query.to);
    }

    const [logs, total] = await Promise.all([
      RequestLog.find(filter)
        .sort({ at: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      RequestLog.countDocuments(filter),
    ]);

    res.json({ logs, total, page, pages: Math.ceil(total / limit) });
  } catch (err) {
    next(err);
  }
});

const discountSchema = z.object({
  discountType: z.enum(['none', 'nonprofit', 'government', 'annual_prepay']),
  studentCount: z.coerce.number().int().positive(),
});

router.patch('/tenants/:id/discount', async (req, res, next) => {
  try {
    const { discountType, studentCount } = discountSchema.parse(req.body);
    const discountPct = DISCOUNT_RATES[discountType] ?? 0;

    const tenant = await Tenant.findById(req.params.id);
    if (!tenant) return res.status(404).json({ error: 'Tenant not found' });

    const before = { discountType: tenant.discountType, discountPct: tenant.discountPct };
    tenant.discountType = discountType;
    tenant.discountPct = discountPct;
    await tenant.save();

    await auditLog({
      actorId: req.user.sub,
      action: 'tenant.discount.updated',
      target: { model: 'Tenant', id: tenant._id },
      before,
      after: { discountType, discountPct },
      ip: req.ip,
    });

    const pricing = calculateFinalPrice(tenant.plan, studentCount, discountType);
    res.json({ tenant, pricing });
  } catch (err) {
    next(err);
  }
});

router.get('/flags', async (req, res, next) => {
  try {
    const flags = await getFlags();
    res.json(flags);
  } catch (err) {
    next(err);
  }
});

const flagSchema = z.object({
  enabled: z.boolean(),
  description: z.string().optional(),
});

router.patch('/flags/:key', async (req, res, next) => {
  try {
    const { enabled, description } = flagSchema.parse(req.body);
    const flag = await toggleFlag(req.params.key, enabled, req.user.sub, description);
    await auditLog({
      actorId: req.user.sub,
      action: 'flag.toggled',
      target: { model: 'FeatureFlag', id: flag._id },
      after: { key: flag.key, enabled: flag.enabled },
      ip: req.ip,
    });
    res.json(flag);
  } catch (err) {
    next(err);
  }
});

export default router;
