import { jest } from '@jest/globals';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose from 'mongoose';

// revokeUserSessions writes to Redis, and ioredis queues commands offline
// rather than failing, so an unmocked client would hang the whole suite.
jest.unstable_mockModule('../config/redis.js', () => ({
  redis: {
    setex: jest.fn(async () => 'OK'),
    get: jest.fn(async () => null),
    del: jest.fn(async () => 1),
    disconnect: jest.fn(),
  },
  connectRedis: jest.fn(async () => {}),
}));

const { User } = await import('../models/User.js');
const { Role } = await import('../models/Role.js');
const { TenantMembership } = await import('../models/TenantMembership.js');
const { hashPassword } = await import('../services/auth.service.js');
const { createOrganization } = await import('../services/tenant.service.js');
const { deleteUserAccount, soleAdminTenants } =
  await import('../services/accountDeletion.service.js');

let mongod;
let n = 0;

beforeAll(async () => {
  // createOrganization runs in a transaction, which needs a replica set.
  mongod = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(mongod.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

async function makeUser(overrides = {}) {
  n += 1;
  return User.create({
    email: `person${n}@school.edu`,
    username: `person-${n}`,
    usernameLower: `person-${n}`,
    firstName: 'Asha',
    lastName: 'Verma',
    phone: '+919999900000',
    passwordHash: await hashPassword('irrelevant-but-valid'),
    emailVerified: true,
    status: 'active',
    ...overrides,
  });
}

const orgFor = (founder, name) =>
  createOrganization({ name, orgType: 'school', founder: founder.toObject() });

test('scrubs every identifying field but keeps the row', async () => {
  const user = await makeUser();

  await deleteUserAccount(user);

  const after = await User.findById(user._id).select('+passwordHash +mfaSecret').lean();
  expect(after).not.toBeNull();
  expect(after.status).toBe('deleted');
  expect(after.email).toBe(`deleted+${user._id}@deleted.invalid`);
  expect(after.firstName).toBeUndefined();
  expect(after.lastName).toBeUndefined();
  expect(after.phone).toBeUndefined();
  expect(after.username).toBeUndefined();
  expect(after.usernameLower).toBeUndefined();
  expect(after.mfaSecret).toBeUndefined();
  // Required field, so it is replaced rather than removed — and must no longer
  // be the password the person chose.
  expect(after.passwordHash).toBeTruthy();
  expect(after.passwordHash).not.toBe(user.passwordHash);
});

test('drops every organization seat', async () => {
  const founder = await makeUser();
  const tenant = await orgFor(founder, 'Seat School');
  // A second admin, so the sole-admin guard does not fire.
  const other = await makeUser();
  const adminRole = await Role.findOne({
    tenantId: tenant._id,
    templateKey: 'tenant_admin',
  }).lean();
  await TenantMembership.create({
    tenantId: tenant._id,
    userId: other._id,
    roleIds: [adminRole._id],
    status: 'active',
  });

  await deleteUserAccount(founder);

  const seats = await TenantMembership.find({ userId: founder._id }, null, {
    _bypassTenantScope: true,
  }).lean();
  expect(seats).toEqual([]);
});

test('refuses while the user is the last admin of an active organization', async () => {
  const founder = await makeUser();
  const tenant = await orgFor(founder, 'Lonely Admin School');

  expect(await soleAdminTenants(founder._id)).toEqual(['Lonely Admin School']);
  await expect(deleteUserAccount(founder)).rejects.toThrow(/only administrator/i);

  // Nothing was touched by the refusal.
  const after = await User.findById(founder._id).lean();
  expect(after.status).toBe('active');
  expect(after.firstName).toBe('Asha');
  const seats = await TenantMembership.countDocuments(
    { userId: founder._id },
    { _bypassTenantScope: true }
  );
  expect(seats).toBe(1);
  expect(tenant.name).toBe('Lonely Admin School');
});

test('allows deletion once another admin exists', async () => {
  const founder = await makeUser();
  const tenant = await orgFor(founder, 'Shared Admin School');
  const successor = await makeUser();
  const adminRole = await Role.findOne({
    tenantId: tenant._id,
    templateKey: 'tenant_admin',
  }).lean();
  await TenantMembership.create({
    tenantId: tenant._id,
    userId: successor._id,
    roleIds: [adminRole._id],
    status: 'active',
  });

  expect(await soleAdminTenants(founder._id)).toEqual([]);
  await expect(deleteUserAccount(founder)).resolves.toBeUndefined();
});

test('refuses for platform operator accounts', async () => {
  const admin = await makeUser({ systemRole: 'super_admin' });
  await expect(deleteUserAccount(admin)).rejects.toThrow(/Platform administrator/i);
});

test('two deleted accounts do not collide on the sparse username index', async () => {
  // usernameLower is unique+sparse, so the fields must be $unset rather than
  // set to null — a null is indexed and the second delete would throw E11000.
  const first = await makeUser();
  const second = await makeUser();

  await deleteUserAccount(first);
  await expect(deleteUserAccount(second)).resolves.toBeUndefined();

  const tombstoned = await User.find({ status: 'deleted' }).lean();
  expect(tombstoned.length).toBeGreaterThanOrEqual(2);
  const emails = tombstoned.map((u) => u.email);
  expect(new Set(emails).size).toBe(emails.length);
});
