import { jest } from '@jest/globals';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { User } from '../models/User.js';
import { TenantMembership } from '../models/TenantMembership.js';
import { StaffMember } from '../models/StaffMember.js';
import {
  provisionStaffUser,
  provisionStaffLogin,
  assertStaffMemberNotLinked,
  setStaffAccessStatus,
} from '../services/staffOnboarding.service.js';

let mongod;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

afterEach(async () => {
  await User.deleteMany({});
  await TenantMembership.deleteMany({}, { _bypassTenantScope: true });
  await StaffMember.deleteMany({}, { _bypassTenantScope: true });
});

test('provisionStaffUser creates a new invited User + TenantMembership for an unseen email', async () => {
  const tenantId = new mongoose.Types.ObjectId();

  const userId = await provisionStaffUser({ tenantId, email: 'new.teacher@testschool.local' });

  const user = await User.findById(userId).select('+passwordHash');
  expect(user.status).toBe('invited');
  expect(user.passwordHash).toBeTruthy();

  const membership = await TenantMembership.findOne({ tenantId, userId });
  expect(membership).not.toBeNull();
  expect(membership.status).toBe('invited');
  expect(membership.roleIds).toEqual([]);
});

test('provisionStaffUser reuses an existing user and does not duplicate the membership', async () => {
  const tenantId = new mongoose.Types.ObjectId();
  const existingUser = await User.create({
    email: 'existing@testschool.local',
    passwordHash: 'hash',
    status: 'active',
  });
  await TenantMembership.create({
    tenantId,
    userId: existingUser._id,
    roleIds: [],
    status: 'active',
  });

  const userId = await provisionStaffUser({ tenantId, email: 'existing@testschool.local' });

  expect(userId.toString()).toBe(existingUser._id.toString());
  const memberships = await TenantMembership.find({ tenantId, userId });
  expect(memberships).toHaveLength(1);
  expect(memberships[0].status).toBe('active');
});

test('assertStaffMemberNotLinked throws 409 when a StaffMember already exists for the user', async () => {
  const tenantId = new mongoose.Types.ObjectId();
  const userId = new mongoose.Types.ObjectId();
  await StaffMember.create({ tenantId, userId, firstName: 'A', lastName: 'B' });

  await expect(assertStaffMemberNotLinked(tenantId, userId)).rejects.toMatchObject({ status: 409 });
});

test('assertStaffMemberNotLinked resolves when no StaffMember exists for the user', async () => {
  const tenantId = new mongoose.Types.ObjectId();
  const userId = new mongoose.Types.ObjectId();

  await expect(assertStaffMemberNotLinked(tenantId, userId)).resolves.toBeUndefined();
});

test('setStaffAccessStatus updates the membership status', async () => {
  const tenantId = new mongoose.Types.ObjectId();
  const userId = new mongoose.Types.ObjectId();
  await TenantMembership.create({ tenantId, userId, roleIds: [], status: 'active' });

  await setStaffAccessStatus(tenantId, userId, 'suspended');

  const membership = await TenantMembership.findOne({ tenantId, userId });
  expect(membership.status).toBe('suspended');
});

describe('provisionStaffLogin', () => {
  const tenant = { _id: new mongoose.Types.ObjectId(), name: 'Test School' };
  const roleIds = [new mongoose.Types.ObjectId()];

  test('gives someone new a claimable login with the chosen roles and mails the link', async () => {
    const enqueue = jest.fn();

    await provisionStaffLogin({
      tenant,
      email: 'new.teacher@testschool.local',
      firstName: 'New',
      lastName: 'Teacher',
      roleIds,
      enqueue,
    });

    const user = await User.findOne({ email: 'new.teacher@testschool.local' });
    expect(user.status).toBe('pending_claim');
    const membership = await TenantMembership.findOne({ tenantId: tenant._id, userId: user._id });
    expect(membership.status).toBe('active');
    expect(membership.roleIds.map(String)).toEqual(roleIds.map(String));
    expect(enqueue).toHaveBeenCalledWith('accountClaim', [
      'new.teacher@testschool.local',
      'Test School',
      expect.stringContaining('/accept-invite?token='),
    ]);
  });

  test('leaves an existing member and their roles alone', async () => {
    const enqueue = jest.fn();
    const user = await User.create({ email: 'old@testschool.local', passwordHash: 'h' });
    await TenantMembership.create({
      tenantId: tenant._id,
      userId: user._id,
      roleIds: [],
      status: 'active',
    });

    await provisionStaffLogin({ tenant, email: 'old@testschool.local', roleIds, enqueue });

    const membership = await TenantMembership.findOne({ tenantId: tenant._id, userId: user._id });
    expect(membership.roleIds).toEqual([]);
    expect(enqueue).not.toHaveBeenCalled();
  });

  test('does nothing without roleIds', async () => {
    const enqueue = jest.fn();
    await provisionStaffLogin({ tenant, email: 'x@testschool.local', enqueue });
    expect(await User.countDocuments({})).toBe(0);
  });
});
