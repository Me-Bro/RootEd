import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { Role } from '../models/Role.js';
import { up } from '../migrations/0002-add-training-permissions.js';

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

// Roles as they exist in a tenant provisioned before this feature: only the
// pre-training permissions, so the migration is the sole thing that can add the
// new ones.
async function seedLegacyTenant(tenantId) {
  const mk = (templateKey, permissions) => ({
    tenantId,
    name: templateKey.replaceAll('_', ' '),
    templateKey,
    isTemplate: true,
    permissions,
  });
  await Role.insertMany([
    mk('tenant_admin', ['students:read', 'students:write', 'grades:read']),
    mk('principal', ['students:read', 'grades:read']),
    mk('teacher', ['students:read', 'attendance:write']),
    mk('student', ['self:attendance:read']),
    mk('accountant', ['fees:read']),
  ]);
}

const perms = async (tenantId, templateKey) =>
  (await Role.findOne({ tenantId, templateKey }).lean()).permissions;

test('adds the training permissions to each template, and complete only to tenant_admin', async () => {
  const tenantId = new mongoose.Types.ObjectId();
  await seedLegacyTenant(tenantId);

  await up();

  expect(await perms(tenantId, 'tenant_admin')).toEqual(
    expect.arrayContaining(['training:read', 'training:write', 'training:complete'])
  );
  const principal = await perms(tenantId, 'principal');
  expect(principal).toContain('training:read');
  expect(principal).not.toContain('training:write');
  expect(principal).not.toContain('training:complete');
  const teacher = await perms(tenantId, 'teacher');
  expect(teacher).toEqual(expect.arrayContaining(['training:read', 'training:write']));
  expect(teacher).not.toContain('training:complete');
  expect(await perms(tenantId, 'student')).toContain('self:training:read');
  // Templates outside this feature are untouched.
  expect(await perms(tenantId, 'accountant')).toEqual(['fees:read']);
});

test('keeps every permission a role already had', async () => {
  const tenantId = new mongoose.Types.ObjectId();
  await seedLegacyTenant(tenantId);
  await up();
  expect(await perms(tenantId, 'tenant_admin')).toEqual(
    expect.arrayContaining(['students:read', 'students:write', 'grades:read'])
  );
});

test('is idempotent: a second run changes nothing', async () => {
  const tenantId = new mongoose.Types.ObjectId();
  await seedLegacyTenant(tenantId);
  await up();
  const first = await perms(tenantId, 'tenant_admin');
  await up();
  expect(await perms(tenantId, 'tenant_admin')).toEqual(first);
});

test('covers every tenant, not just the first', async () => {
  const a = new mongoose.Types.ObjectId();
  const b = new mongoose.Types.ObjectId();
  await seedLegacyTenant(a);
  await seedLegacyTenant(b);
  await up();
  expect(await perms(a, 'teacher')).toContain('training:write');
  expect(await perms(b, 'teacher')).toContain('training:write');
});

test('does not give a custom (non-template) role the new permissions', async () => {
  const tenantId = new mongoose.Types.ObjectId();
  await seedLegacyTenant(tenantId);
  await Role.create({ tenantId, name: 'custom', permissions: ['students:read'] });
  await up();
  const custom = await Role.findOne({ tenantId, name: 'custom' }).lean();
  expect(custom.permissions).toEqual(['students:read']);
});
