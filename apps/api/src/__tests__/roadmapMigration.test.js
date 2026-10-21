import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { Role } from '../models/Role.js';
import { up } from '../migrations/0003-add-self-training-write.js';

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
  await Role.deleteMany({}, { _bypassTenantScope: true });
});

// Roles as they exist in a tenant provisioned before this feature.
async function seedLegacyTenant(tenantId) {
  const mk = (templateKey, permissions) => ({
    tenantId,
    name: templateKey,
    templateKey,
    isTemplate: true,
    permissions,
  });
  await Role.insertMany([
    mk('student', ['self:attendance:read', 'self:training:read']),
    mk('teacher', ['training:read', 'training:write']),
  ]);
}

const perms = async (tenantId, name) => (await Role.findOne({ tenantId, name }).lean()).permissions;

test('adds self:training:write to the student template and keeps what it had', async () => {
  const tenantId = new mongoose.Types.ObjectId();
  await seedLegacyTenant(tenantId);
  await up();
  expect(await perms(tenantId, 'student')).toEqual(
    expect.arrayContaining(['self:attendance:read', 'self:training:read', 'self:training:write'])
  );
});

test('leaves staff templates and custom roles alone', async () => {
  const tenantId = new mongoose.Types.ObjectId();
  await seedLegacyTenant(tenantId);
  await Role.create({ tenantId, name: 'custom', permissions: ['self:training:read'] });
  await up();
  expect(await perms(tenantId, 'teacher')).toEqual(['training:read', 'training:write']);
  expect(await perms(tenantId, 'custom')).toEqual(['self:training:read']);
});

test('is idempotent and covers every tenant', async () => {
  const a = new mongoose.Types.ObjectId();
  const b = new mongoose.Types.ObjectId();
  await seedLegacyTenant(a);
  await seedLegacyTenant(b);
  await up();
  await up();
  for (const t of [a, b]) {
    const p = await perms(t, 'student');
    expect(p.filter((x) => x === 'self:training:write')).toHaveLength(1);
  }
});
