import crypto from 'crypto';
import mongoose from 'mongoose';
import { Tenant } from '../models/Tenant.js';
import { User } from '../models/User.js';
import { Role, DEFAULT_ROLE_TEMPLATES } from '../models/Role.js';
import { LeaveType, DEFAULT_LEAVE_TYPES } from '../models/LeaveType.js';
import { TenantMembership } from '../models/TenantMembership.js';
import {
  hashPassword,
  generateToken,
  storeResetToken,
  INVITE_TOKEN_TTL_MS,
} from './auth.service.js';
import { AppError } from '../middleware/errorHandler.js';
import { sendTenantInvite } from './email.service.js';
import { env, getPortalHost } from '../config/env.js';

/** Organizations a single person may create. See ADR 006 §D5. */
export const MAX_ORGS_PER_FOUNDER = 3;

/**
 * Creates a tenant with its role templates and leave types, inside the caller's
 * transaction. Every write takes the session: a half-provisioned tenant — one
 * with no tenant_admin role, say — is unreachable and unrepairable through the
 * API, and under self-serve creation it also burns the name the user chose.
 */
async function provisionTenant(
  { name, subdomain, plan, orgType, locale, timezone, currency },
  session
) {
  // Trials only mean something when there is something to pay for.
  const trial = env.BILLING_ENABLED
    ? { trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), isTrialActive: true }
    : {};

  const [tenant] = await Tenant.create(
    [{ name, subdomain, plan, orgType, locale, timezone, currency, ...trial }],
    { session }
  );

  const roles = await Role.insertMany(
    Object.entries(DEFAULT_ROLE_TEMPLATES).map(([key, permissions]) => ({
      tenantId: tenant._id,
      name: key.replaceAll('_', ' '),
      permissions,
      isTemplate: true,
      templateKey: key,
    })),
    { session }
  );

  await LeaveType.insertMany(
    DEFAULT_LEAVE_TYPES.map((leaveType) => ({ tenantId: tenant._id, ...leaveType })),
    { session }
  );

  return { tenant, roles, adminRole: roles.find((r) => r.templateKey === 'tenant_admin') };
}

/**
 * Self-serve organization creation. The founder is the authenticated caller, so
 * there is no invitation step and the membership is active immediately.
 *
 * Deliberately creates no subdomain: in the deployment that actually runs,
 * tenant hostnames need a manual DNS route, so an API-allocated subdomain would
 * resolve to nothing. Subdomain-less tenants are fully supported — the tenant
 * is carried on the access token instead. See ADR 005 §12.1.
 */
export async function createOrganization({ name, orgType, locale, timezone, currency, founder }) {
  const existing = await TenantMembership.countDocuments({
    userId: founder._id,
    joinMethod: 'founder',
  });
  if (existing >= MAX_ORGS_PER_FOUNDER) {
    throw new AppError(`You can create at most ${MAX_ORGS_PER_FOUNDER} organizations`, 409);
  }

  const session = await mongoose.startSession();
  try {
    let created;
    await session.withTransaction(async () => {
      const { tenant, adminRole } = await provisionTenant(
        { name, orgType, locale, timezone, currency, plan: undefined },
        session
      );

      await TenantMembership.create(
        [
          {
            tenantId: tenant._id,
            userId: founder._id,
            roleIds: [adminRole._id],
            status: 'active',
            joinMethod: 'founder',
          },
        ],
        { session }
      );

      created = tenant;
    });
    return created;
  } finally {
    await session.endSession();
  }
}

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
  if (subdomain) {
    const exists = await Tenant.findOne({ subdomain });
    if (exists) throw new AppError('Subdomain already taken', 409);
  }

  const session = await mongoose.startSession();
  let tenant;
  let adminRole;
  try {
    await session.withTransaction(async () => {
      ({ tenant, adminRole } = await provisionTenant(
        { name, subdomain, plan, orgType, locale, timezone, currency },
        session
      ));
    });
  } catch (err) {
    // findOne-then-create above is not atomic; the unique index is.
    if (err.code === 11000) throw new AppError('Subdomain already taken', 409);
    throw err;
  } finally {
    await session.endSession();
  }

  // Create or find admin user
  let adminUser = await User.findOne({ email: adminEmail });
  const isNewUser = !adminUser;
  if (!adminUser) {
    adminUser = await User.create({
      email: adminEmail,
      passwordHash: await hashPassword(adminPassword ?? crypto.randomUUID()),
      status: adminPassword ? 'active' : 'invited',
    });
  }

  // 'active', not 'invited'. Membership status governs access to *this* tenant
  // and getActiveTenantsForUser() filters on it, so gating it behind an
  // acceptance step that had no endpoint left every provisioned admin
  // permanently locked out. Credential state lives on User.status instead.
  await TenantMembership.create({
    tenantId: tenant._id,
    userId: adminUser._id,
    roleIds: [adminRole._id],
    status: 'active',
  });

  const inviteHost = tenant.subdomain ? `${tenant.subdomain}.${env.APP_DOMAIN}` : getPortalHost();
  // A user we just created without a supplied password holds a random one they
  // were never told, so they need a tokened link to set their own. Everyone
  // else already has working credentials and only needed the membership above.
  let inviteUrl = `https://${inviteHost}/login`;
  if (isNewUser && !adminPassword) {
    const token = generateToken();
    await storeResetToken(adminUser._id, token, INVITE_TOKEN_TTL_MS);
    inviteUrl = `https://${inviteHost}/accept-invite?token=${token}`;
  }
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
