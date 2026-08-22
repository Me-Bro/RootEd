import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { Tenant } from '../models/Tenant.js';
import { TenantMembership } from '../models/TenantMembership.js';
import { getActiveTenantsForUser } from '../services/auth.service.js';
import { redis } from '../config/redis.js';

let mongod;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
  redis.disconnect();
});

test('user with no memberships gets an empty list', async () => {
  const userId = new mongoose.Types.ObjectId();
  expect(await getActiveTenantsForUser(userId)).toEqual([]);
});

test('one active membership in an active tenant is returned', async () => {
  const userId = new mongoose.Types.ObjectId();
  const tenant = await Tenant.create({ name: 'Acme', subdomain: 'auth-acme', status: 'active' });
  await TenantMembership.create({ tenantId: tenant._id, userId, roleIds: [], status: 'active' });

  const tenants = await getActiveTenantsForUser(userId);
  expect(tenants).toEqual([{ _id: tenant._id.toString(), name: 'Acme', subdomain: 'auth-acme' }]);
});

test('memberships that are not active are excluded', async () => {
  const userId = new mongoose.Types.ObjectId();
  const tenant = await Tenant.create({
    name: 'Invited Co',
    subdomain: 'auth-invited',
    status: 'active',
  });
  await TenantMembership.create({ tenantId: tenant._id, userId, roleIds: [], status: 'invited' });

  expect(await getActiveTenantsForUser(userId)).toEqual([]);
});

test('an active membership pointing at a suspended tenant is excluded', async () => {
  const userId = new mongoose.Types.ObjectId();
  const tenant = await Tenant.create({
    name: 'Suspended Co',
    subdomain: 'auth-suspended',
    status: 'suspended',
  });
  await TenantMembership.create({ tenantId: tenant._id, userId, roleIds: [], status: 'active' });

  expect(await getActiveTenantsForUser(userId)).toEqual([]);
});

test('multiple active memberships across active tenants are all returned', async () => {
  const userId = new mongoose.Types.ObjectId();
  const tenantA = await Tenant.create({ name: 'Alpha', subdomain: 'auth-alpha', status: 'active' });
  const tenantB = await Tenant.create({ name: 'Beta', subdomain: 'auth-beta', status: 'active' });
  await TenantMembership.create({ tenantId: tenantA._id, userId, roleIds: [], status: 'active' });
  await TenantMembership.create({ tenantId: tenantB._id, userId, roleIds: [], status: 'active' });

  const tenants = await getActiveTenantsForUser(userId);
  expect(tenants.map((t) => t.subdomain).sort()).toEqual(['auth-alpha', 'auth-beta']);
});
