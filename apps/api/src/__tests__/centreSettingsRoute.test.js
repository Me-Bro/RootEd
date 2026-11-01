// PATCH/GET /tenant/settings for the study-center centre settings, through a mini
// Express app against an in-memory Mongo with Redis faked.
import { jest } from '@jest/globals';

jest.unstable_mockModule('../services/audit.service.js', () => ({
  auditLog: jest.fn().mockResolvedValue(undefined),
  processAuditLog: jest.fn(),
}));
jest.unstable_mockModule('../config/redis.js', () => ({
  redis: {
    get: jest.fn(async () => null),
    setex: jest.fn(async () => 'OK'),
    del: jest.fn(async () => 1),
    scan: jest.fn(async () => ['0', []]),
    disconnect: jest.fn(),
  },
  connectRedis: jest.fn(async () => {}),
}));
jest.unstable_mockModule('bullmq', () => ({
  Queue: class {
    add() {}
    on() {}
    close() {}
  },
  Worker: class {},
}));

const { MongoMemoryServer } = await import('mongodb-memory-server');
const { default: mongoose } = await import('mongoose');
const { default: express } = await import('express');
const { default: request } = await import('supertest');
const { Tenant } = await import('../models/Tenant.js');
const { Role, DEFAULT_ROLE_TEMPLATES } = await import('../models/Role.js');
const { User } = await import('../models/User.js');
const { TenantMembership } = await import('../models/TenantMembership.js');
const { default: tenantRouter } = await import('../routes/tenant.js');
const { signAccessToken, hashPassword } = await import('../services/auth.service.js');
const { errorHandler } = await import('../middleware/errorHandler.js');

let mongod;
let app;
const tenants = {};
const tokens = {};
let n = 0;

async function makeTenant(subdomain, orgType) {
  const tenant = await Tenant.create({ name: subdomain, subdomain, orgType });
  const roles = {};
  for (const [key, permissions] of Object.entries(DEFAULT_ROLE_TEMPLATES)) {
    roles[key] = await Role.create({
      tenantId: tenant._id,
      name: key,
      templateKey: key,
      permissions,
    });
  }
  return { tenant, roles };
}

async function makeMember(tenant, role, label) {
  n += 1;
  const user = await User.create({
    email: `${label}${n}@centre.test`,
    username: `${label}-${n}`,
    usernameLower: `${label}-${n}`,
    passwordHash: await hashPassword('irrelevant-but-valid'),
    emailVerified: true,
    status: 'active',
  });
  await TenantMembership.create({
    tenantId: tenant._id,
    userId: user._id,
    roleIds: [role._id],
    status: 'active',
  });
  return signAccessToken({ sub: user._id.toString() });
}

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  const study = await makeTenant('centre-study', 'study_center');
  const school = await makeTenant('centre-school', 'school');
  tenants.study = study.tenant;
  tenants.school = school.tenant;
  tokens.owner = await makeMember(study.tenant, study.roles.tenant_admin, 'owner');
  tokens.desk = await makeMember(study.tenant, study.roles.front_desk, 'desk');
  tokens.schoolAdmin = await makeMember(school.tenant, school.roles.tenant_admin, 'sadmin');

  app = express();
  app.use(express.json());
  app.use(async (req, _res, next) => {
    // The real resolveTenant loads a fresh lean tenant per request; do the same so
    // a saved setting is visible on the next call.
    req.tenant = await Tenant.findById(tenants[req.headers['x-tenant'] ?? 'study']._id).lean();
    next();
  });
  app.use('/tenant', tenantRouter);
  app.use(errorHandler);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

const call = (method, who, body, tenant = 'study') => {
  const req = request(app)[method]('/tenant/settings').set('x-tenant', tenant);
  if (who) req.set('Authorization', `Bearer ${tokens[who]}`);
  return body === undefined ? req : req.send(body);
};

test('GET gives a study center its centre settings with defaults filled in', async () => {
  const res = await call('get', 'owner');
  expect(res.status).toBe(200);
  expect(res.body.centre).toEqual({
    openTime: '06:00',
    closeTime: '22:00',
    open24h: false,
    discountPolicy: 'owner',
  });
});

test('GET leaves other org types untouched', async () => {
  const res = await call('get', 'schoolAdmin', undefined, 'school');
  expect(res.body.centre).toBeUndefined();
});

test('the owner saves opening hours and a discount policy, and GET reflects them', async () => {
  const saved = await call('patch', 'owner', {
    centre: { openTime: '05:30', closeTime: '23:00', discountPolicy: 'desk' },
  });
  expect(saved.status).toBe(200);
  expect(saved.body.settings.centre).toMatchObject({
    openTime: '05:30',
    closeTime: '23:00',
    discountPolicy: 'desk',
  });
  expect((await call('get', 'owner')).body.centre).toMatchObject({
    openTime: '05:30',
    closeTime: '23:00',
    discountPolicy: 'desk',
    open24h: false,
  });
});

test('saving one key keeps the others', async () => {
  await call('patch', 'owner', { centre: { openTime: '07:00', closeTime: '21:00' } });
  await call('patch', 'owner', { centre: { discountPolicy: 'owner' } });
  expect((await call('get', 'owner')).body.centre).toMatchObject({
    openTime: '07:00',
    closeTime: '21:00',
    discountPolicy: 'owner',
  });
});

test('a closing time that lands before the saved opening time is rejected', async () => {
  await call('patch', 'owner', { centre: { openTime: '08:00', closeTime: '20:00' } });
  const res = await call('patch', 'owner', { centre: { closeTime: '07:00' } });
  expect(res.status).toBe(400);
  expect((await call('get', 'owner')).body.centre.closeTime).toBe('20:00');
});

test('a bad time or unknown policy is rejected', async () => {
  expect((await call('patch', 'owner', { centre: { openTime: '25:00' } })).status).toBe(400);
  expect((await call('patch', 'owner', { centre: { discountPolicy: 'all' } })).status).toBe(400);
});

test('only tenant:admin may save', async () => {
  const res = await call('patch', 'desk', { centre: { discountPolicy: 'desk' } });
  expect(res.status).toBe(403);
});

test('another org type cannot save centre settings', async () => {
  const res = await call('patch', 'schoolAdmin', { centre: { discountPolicy: 'desk' } }, 'school');
  expect(res.status).toBe(400);
});

test('the existing settings payload still works unchanged', async () => {
  const res = await call('patch', 'owner', { name: 'Renamed Study Center' });
  expect(res.status).toBe(200);
  expect(res.body.name).toBe('Renamed Study Center');
});
