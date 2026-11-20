import { jest } from '@jest/globals';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { ORG_CODE_ALPHABET, ORG_CODE_LENGTH } from '@rooted/shared/constants';
import { formatOrgCode } from '@rooted/shared/utils';
import { Tenant } from '../models/Tenant.js';
import { User } from '../models/User.js';
import { TenantMembership } from '../models/TenantMembership.js';
import { hashPassword, getActiveTenantsForUser } from '../services/auth.service.js';
import { createOrganization } from '../services/tenant.service.js';
import { generateOrgCode, allocateOrgCode, ensureOrgCode } from '../services/orgCode.service.js';
import { redis } from '../config/redis.js';

let mongod;
let n = 0;

beforeAll(async () => {
  mongod = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(mongod.getUri());
  await Tenant.syncIndexes();
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
  redis.disconnect();
});

async function makeFounder() {
  n += 1;
  return User.create({
    email: `oc-founder${n}@school.edu`,
    username: `oc-founder-${n}`,
    usernameLower: `oc-founder-${n}`,
    passwordHash: await hashPassword('irrelevant-but-valid'),
    emailVerified: true,
    status: 'active',
  });
}

test('generated codes use the unambiguous alphabet and fixed length', () => {
  for (let i = 0; i < 200; i += 1) {
    const code = generateOrgCode();
    expect(code).toHaveLength(ORG_CODE_LENGTH);
    expect(code).toMatch(/^[A-HJ-KM-NP-Z2-9]{8}$/);
    for (const ch of code) expect(ORG_CODE_ALPHABET).toContain(ch);
    expect(code).not.toMatch(/[01OIL]/);
  }
});

test('formatOrgCode groups the code and tolerates a missing one', () => {
  expect(formatOrgCode('ABCD2345')).toBe('ABCD-2345');
  expect(formatOrgCode(undefined)).toBe('');
  expect(formatOrgCode(null)).toBe('');
});

test('a newly created organization has an org code, distinct from the join code', async () => {
  const a = await createOrganization({
    name: 'Code School A',
    orgType: 'school',
    founder: (await makeFounder()).toObject(),
  });
  const b = await createOrganization({
    name: 'Code School A',
    orgType: 'school',
    founder: (await makeFounder()).toObject(),
  });
  const [ta, tb] = await Promise.all([
    Tenant.findById(a._id).lean(),
    Tenant.findById(b._id).lean(),
  ]);
  expect(ta.orgCode).toMatch(/^[A-HJ-KM-NP-Z2-9]{8}$/);
  expect(tb.orgCode).toMatch(/^[A-HJ-KM-NP-Z2-9]{8}$/);
  expect(ta.orgCode).not.toBe(tb.orgCode);
  expect(ta.joinPolicy?.code).toBeUndefined();
});

test('the unique index rejects a second tenant with the same code', async () => {
  const code = await allocateOrgCode();
  await Tenant.create({ name: 'Dup One', orgCode: code });
  await expect(Tenant.create({ name: 'Dup Two', orgCode: code })).rejects.toMatchObject({
    code: 11000,
  });
});

test('allocateOrgCode retries when a generated code is already taken', async () => {
  const taken = await allocateOrgCode();
  await Tenant.create({ name: 'Taken', orgCode: taken });
  const fresh = 'ZZZZ2222';
  const generate = jest.fn().mockReturnValueOnce(taken).mockReturnValueOnce(fresh);
  expect(await allocateOrgCode(generate)).toBe(fresh);
  expect(generate).toHaveBeenCalledTimes(2);
});

test('org code is immutable once saved', async () => {
  const t = await Tenant.create({ name: 'Immutable', orgCode: await allocateOrgCode() });
  const before = t.orgCode;
  t.orgCode = 'AAAA2222';
  await t.save();
  expect((await Tenant.findById(t._id).lean()).orgCode).toBe(before);
});

test('ensureOrgCode gives a codeless tenant a code once and keeps it', async () => {
  const t = await Tenant.create({ name: 'Codeless' });
  expect(t.orgCode).toBeUndefined();
  const first = await ensureOrgCode(t._id);
  const [x, y] = await Promise.all([ensureOrgCode(t._id), ensureOrgCode(t._id)]);
  expect(x).toBe(first);
  expect(y).toBe(first);
  expect((await Tenant.findById(t._id).lean()).orgCode).toBe(first);
});

test("getActiveTenantsForUser returns each org's code, filling a missing one", async () => {
  const founder = await makeFounder();
  const withCode = await Tenant.create({ name: 'Has Code', orgCode: await allocateOrgCode() });
  const without = await Tenant.create({ name: 'Needs Code' });
  for (const t of [withCode, without]) {
    await TenantMembership.create({
      tenantId: t._id,
      userId: founder._id,
      roleIds: [],
      status: 'active',
    });
  }
  const orgs = await getActiveTenantsForUser(founder._id);
  const byName = Object.fromEntries(orgs.map((o) => [o.name, o]));
  expect(byName['Has Code'].orgCode).toBe(withCode.orgCode);
  expect(byName['Needs Code'].orgCode).toMatch(/^[A-HJ-KM-NP-Z2-9]{8}$/);
  expect((await Tenant.findById(without._id).lean()).orgCode).toBe(byName['Needs Code'].orgCode);
});
