import crypto from 'crypto';
import { Tenant } from '../models/Tenant.js';
import { User } from '../models/User.js';
import { Role, DEFAULT_ROLE_TEMPLATES } from '../models/Role.js';
import { LeaveType, DEFAULT_LEAVE_TYPES } from '../models/LeaveType.js';
import { TenantMembership } from '../models/TenantMembership.js';
import { hashPassword } from './auth.service.js';
import { AppError } from '../middleware/errorHandler.js';
import { sendTenantInvite } from './email.service.js';
import { env } from '../config/env.js';

export async function createTenant({
  name,
  subdomain,
  plan,
  orgType,
  adminEmail,
  adminPassword,
  locale,
  timezone,
  currency,
}) {
  const exists = await Tenant.findOne({ subdomain });
  if (exists) throw new AppError('Subdomain already taken', 409);

  const trialEndsAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
  const tenant = await Tenant.create({
    name,
    subdomain,
    plan,
    orgType,
    locale,
    timezone,
    currency,
    trialEndsAt,
    isTrialActive: true,
  });

  // Seed default roles
  const roleEntries = Object.entries(DEFAULT_ROLE_TEMPLATES).map(([key, permissions]) => ({
    tenantId: tenant._id,
    name: key.replace('_', ' '),
    permissions,
    isTemplate: true,
    templateKey: key,
  }));
  const roles = await Role.insertMany(roleEntries);
  const adminRole = roles.find((r) => r.templateKey === 'tenant_admin');

  await LeaveType.insertMany(
    DEFAULT_LEAVE_TYPES.map((leaveType) => ({ tenantId: tenant._id, ...leaveType }))
  );

  // Create or find admin user
  let adminUser = await User.findOne({ email: adminEmail });
  if (!adminUser) {
    adminUser = await User.create({
      email: adminEmail,
      passwordHash: await hashPassword(adminPassword ?? crypto.randomUUID()),
      status: adminPassword ? 'active' : 'invited',
    });
  }

  await TenantMembership.create({
    tenantId: tenant._id,
    userId: adminUser._id,
    roleIds: [adminRole._id],
    status: 'invited',
  });

  const inviteUrl = `https://${tenant.subdomain}.${env.APP_DOMAIN}/accept-invite`;
  await sendTenantInvite(adminEmail, tenant.name, inviteUrl);

  return tenant;
}

export async function suspendTenant(tenantId) {
  const tenant = await Tenant.findById(tenantId);
  if (!tenant) throw new AppError('Tenant not found', 404);
  if (tenant.status === 'archived') throw new AppError('Cannot suspend archived tenant', 400);
  tenant.status = 'suspended';
  await tenant.save();
  return tenant;
}

export async function archiveTenant(tenantId) {
  const tenant = await Tenant.findById(tenantId);
  if (!tenant) throw new AppError('Tenant not found', 404);
  const retentionUntil = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
  tenant.status = 'archived';
  tenant.archivedAt = new Date();
  tenant.dataRetentionUntil = retentionUntil;
  await tenant.save();
  return tenant;
}

export async function restoreTenant(tenantId) {
  const tenant = await Tenant.findById(tenantId);
  if (!tenant) throw new AppError('Tenant not found', 404);
  if (tenant.status !== 'archived') throw new AppError('Tenant is not archived', 400);
  if (tenant.dataRetentionUntil < new Date()) throw new AppError('Retention window expired', 400);
  tenant.status = 'active';
  tenant.archivedAt = undefined;
  tenant.dataRetentionUntil = undefined;
  await tenant.save();
  return tenant;
}
