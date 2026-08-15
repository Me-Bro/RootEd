import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { TenantMembership } from '../models/TenantMembership.js';
import { Role } from '../models/Role.js';

let mongod;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

test('TenantMembership.find without tenantId throws isolation error', async () => {
  await expect(TenantMembership.find({}).exec()).rejects.toThrow('tenantId missing from query');
});

test('TenantMembership.find with tenantId succeeds and returns empty array', async () => {
  const tenantId = new mongoose.Types.ObjectId();
  const result = await TenantMembership.find({ tenantId });
  expect(Array.isArray(result)).toBe(true);
  expect(result).toHaveLength(0);
});

test('new Role without tenantId throws on save', async () => {
  const role = new Role({ name: 'test', permissions: [] });
  await expect(role.save()).rejects.toThrow(/tenantId/);
});

test('Role.find with _bypassTenantScope succeeds without tenantId', async () => {
  const result = await Role.find({}, null, { _bypassTenantScope: true });
  expect(Array.isArray(result)).toBe(true);
});
