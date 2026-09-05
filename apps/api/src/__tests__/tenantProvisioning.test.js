import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { User } from '../models/User.js';
import { Role } from '../models/Role.js';
import { TenantMembership } from '../models/TenantMembership.js';
import { createTenant } from '../services/tenant.service.js';
import { getActiveTenantsForUser } from '../services/auth.service.js';
import { redis } from '../config/redis.js';

let mongod;

beforeAll(async () => {
  // A replica set, not a standalone: tenant provisioning runs in a transaction
  // so a half-created tenant cannot exist, and transactions need one. Dev and
  // production both run rs0, so this matches them rather than working around
  // the difference.
  mongod = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(mongod.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
  redis.disconnect();
});

// SMTP_HOST is unset under Jest, so createSmtpTransport() returns null and
// sendViaSmtp() no-ops — createTenant can be exercised without mocking email.

const base = {
  plan: 'starter',
  orgType: 'school',
  locale: 'en',
  timezone: 'Asia/Kolkata',
  currency: 'INR',
};

test('a provisioned admin can actually reach their new tenant', async () => {
  const tenant = await createTenant({
    ...base,
    name: 'Provisioned School',
    subdomain: 'provisioned-school',
    adminEmail: 'provisioned-admin@test.local',
  });

  const admin = await User.findOne({ email: 'provisioned-admin@test.local' }).lean();
  const membership = await TenantMembership.findOne({
    tenantId: tenant._id,
    userId: admin._id,
  }).lean();

  expect(membership.status).toBe('active');

  // The regression: getActiveTenantsForUser() filters on status 'active', so an
  // 'invited' membership made the tenant invisible with no way to accept it.
  const tenants = await getActiveTenantsForUser(admin._id);
  expect(tenants.map((t) => t._id)).toContain(tenant._id.toString());
});

test('the admin is granted the tenant_admin role', async () => {
  const tenant = await createTenant({
    ...base,
    name: 'Role School',
    subdomain: 'role-school',
    adminEmail: 'role-admin@test.local',
  });

  const admin = await User.findOne({ email: 'role-admin@test.local' }).lean();
  const membership = await TenantMembership.findOne({
    tenantId: tenant._id,
    userId: admin._id,
  }).lean();
  const role = await Role.findOne({ tenantId: tenant._id, templateKey: 'tenant_admin' }).lean();

  expect(membership.roleIds.map(String)).toEqual([role._id.toString()]);
});

test('an admin created without a password gets a usable invite token', async () => {
  await createTenant({
    ...base,
    name: 'Tokened School',
    subdomain: 'tokened-school',
    adminEmail: 'tokened-admin@test.local',
  });

  const admin = await User.findOne({ email: 'tokened-admin@test.local' })
    .select('+passwordResetToken +passwordResetExpires')
    .lean();

  expect(admin.status).toBe('invited');
  expect(admin.passwordResetToken).toEqual(expect.any(String));
  expect(admin.passwordResetExpires.getTime()).toBeGreaterThan(Date.now());
});

test('an admin created with a password gets no invite token', async () => {
  await createTenant({
    ...base,
    name: 'Passworded School',
    subdomain: 'passworded-school',
    adminEmail: 'passworded-admin@test.local',
    adminPassword: 'SuppliedPass123!',
  });

  const admin = await User.findOne({ email: 'passworded-admin@test.local' })
    .select('+passwordResetToken')
    .lean();

  expect(admin.status).toBe('active');
  expect(admin.passwordResetToken).toBeUndefined();
});

test('an existing user added to a second tenant keeps their credentials and gains access', async () => {
  const first = await createTenant({
    ...base,
    name: 'First School',
    subdomain: 'first-school',
    adminEmail: 'multi-admin@test.local',
    adminPassword: 'SuppliedPass123!',
  });
  const before = await User.findOne({ email: 'multi-admin@test.local' })
    .select('+passwordHash +passwordResetToken')
    .lean();

  const second = await createTenant({
    ...base,
    name: 'Second School',
    subdomain: 'second-school',
    adminEmail: 'multi-admin@test.local',
  });
  const after = await User.findOne({ email: 'multi-admin@test.local' })
    .select('+passwordHash +passwordResetToken')
    .lean();

  // No reset token is issued to somebody who already has a working password,
  // and their existing hash is left alone.
  expect(after.passwordHash).toBe(before.passwordHash);
  expect(after.passwordResetToken).toBeUndefined();

  const tenants = await getActiveTenantsForUser(after._id);
  expect(tenants.map((t) => t._id).sort()).toEqual(
    [first._id.toString(), second._id.toString()].sort()
  );
});
