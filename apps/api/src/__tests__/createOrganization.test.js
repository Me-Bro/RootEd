import { jest } from '@jest/globals';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { Tenant } from '../models/Tenant.js';
import { Role } from '../models/Role.js';
import { User } from '../models/User.js';
import { LeaveType } from '../models/LeaveType.js';
import { TenantMembership } from '../models/TenantMembership.js';
import { hashPassword, getActiveTenantsForUser } from '../services/auth.service.js';
import { createOrganization, MAX_ORGS_PER_FOUNDER } from '../services/tenant.service.js';
import { redis } from '../config/redis.js';

let mongod;
let n = 0;

beforeAll(async () => {
  // Provisioning runs in a transaction, which needs a replica set — as dev and
  // production both are.
  mongod = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(mongod.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
  redis.disconnect();
});

async function makeFounder() {
  n += 1;
  return User.create({
    email: `founder${n}@school.edu`,
    username: `founder-${n}`,
    usernameLower: `founder-${n}`,
    passwordHash: await hashPassword('irrelevant-but-valid'),
    emailVerified: true,
    status: 'active',
  });
}

const org = (founder, name) =>
  createOrganization({ name, orgType: 'school', founder: founder.toObject() });

test('the founder lands as an active tenant_admin', async () => {
  const founder = await makeFounder();
  const tenant = await org(founder, 'Founder School');

  const membership = await TenantMembership.findOne({
    tenantId: tenant._id,
    userId: founder._id,
  }).lean();
  const adminRole = await Role.findOne({
    tenantId: tenant._id,
    templateKey: 'tenant_admin',
  }).lean();

  expect(membership.status).toBe('active');
  expect(membership.joinMethod).toBe('founder');
  expect(membership.roleIds.map(String)).toEqual([String(adminRole._id)]);

  // The whole point: they can reach it immediately, with no acceptance step.
  const reachable = await getActiveTenantsForUser(founder._id);
  expect(reachable.map((t) => t._id)).toContain(tenant._id.toString());
});

test('the organization is created with no subdomain', async () => {
  const founder = await makeFounder();
  const tenant = await org(founder, 'No Subdomain School');
  // Tenant hostnames need a manual DNS route, so an API-allocated subdomain
  // would resolve to nothing. Sparse index tolerates many without one.
  expect(tenant.subdomain).toBeUndefined();
});

test('role templates and leave types are seeded', async () => {
  const founder = await makeFounder();
  const tenant = await org(founder, 'Seeded School');

  const roles = await Role.find({ tenantId: tenant._id }).lean();
  const leaveTypes = await LeaveType.find({ tenantId: tenant._id }).lean();

  expect(roles.map((r) => r.templateKey).sort()).toEqual(
    ['accountant', 'librarian', 'principal', 'student', 'teacher', 'tenant_admin'].sort()
  );
  expect(leaveTypes.length).toBeGreaterThan(0);
});

test('the plan is free and no trial is started', async () => {
  const founder = await makeFounder();
  const tenant = await org(founder, 'Free School');
  expect(tenant.plan).toBe('free');
  expect(tenant.isTrialActive).toBe(false);
  expect(tenant.trialEndsAt).toBeUndefined();
});

test('role names no longer keep an underscore', async () => {
  const founder = await makeFounder();
  const tenant = await org(founder, 'Naming School');
  const admin = await Role.findOne({ tenantId: tenant._id, templateKey: 'tenant_admin' }).lean();
  expect(admin.name).toBe('tenant admin');
});

test('a founder is capped, and the cap counts only organizations they founded', async () => {
  const founder = await makeFounder();
  for (let i = 0; i < MAX_ORGS_PER_FOUNDER; i += 1) {
    await org(founder, `Capped School ${i}`);
  }

  await expect(org(founder, 'One Too Many')).rejects.toThrow(/at most/i);

  // Joining others' organizations must not consume the allowance.
  const other = await Tenant.create({ name: 'Someone Else', subdomain: 'someone-else' });
  await TenantMembership.create({
    tenantId: other._id,
    userId: founder._id,
    roleIds: [],
    status: 'active',
    joinMethod: 'invite',
  });
  expect(
    await TenantMembership.countDocuments({ userId: founder._id, joinMethod: 'founder' })
  ).toBe(MAX_ORGS_PER_FOUNDER);
});

test('a failure part-way through leaves nothing behind', async () => {
  const founder = await makeFounder();
  const before = await Tenant.countDocuments();

  // Fail after the Tenant insert but before the membership: without a
  // transaction this is exactly how an unreachable, half-provisioned tenant
  // gets created — and, under self-serve, burns the name the user chose.
  const spy = jest.spyOn(LeaveType, 'insertMany').mockRejectedValueOnce(new Error('boom'));

  await expect(org(founder, 'Rolled Back School')).rejects.toThrow('boom');
  spy.mockRestore();

  expect(await Tenant.countDocuments()).toBe(before);
  expect(await Tenant.findOne({ name: 'Rolled Back School' }).lean()).toBeNull();
  expect(await TenantMembership.countDocuments({ userId: founder._id })).toBe(0);
});
