// Study-center expenses (no approval chain, fixed categories, centre-calendar day),
// driven through a mini Express app against an in-memory Mongo. Redis and BullMQ are
// faked: the permission cache only needs get/setex/del, and the expense router imports
// the escalation worker.
import { jest } from '@jest/globals';

const auditLog = jest.fn().mockResolvedValue(undefined);
jest.unstable_mockModule('../services/audit.service.js', () => ({
  auditLog,
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
const { ExpenseEntry } = await import('../models/ExpenseEntry.js');
const { TenantMembership } = await import('../models/TenantMembership.js');
const { default: expenseRouter } = await import('../routes/expense.js');
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
    email: `${label}${n}@study.test`,
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

  const study = await makeTenant('study-a', 'study_center');
  const study2 = await makeTenant('study-b', 'study_center');
  const school = await makeTenant('school-a', 'school');
  tenants.study = study.tenant;
  tenants.study2 = study2.tenant;
  tenants.school = school.tenant;

  tokens.admin = await makeMember(study.tenant, study.roles.tenant_admin, 'admin');
  tokens.desk = await makeMember(study.tenant, study.roles.front_desk, 'desk');
  tokens.admin2 = await makeMember(study2.tenant, study2.roles.tenant_admin, 'admin2');
  tokens.schoolAdmin = await makeMember(school.tenant, school.roles.tenant_admin, 'school');

  app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.tenant = tenants[req.headers['x-tenant'] ?? 'study'];
    next();
  });
  app.use('/expense', expenseRouter);
  app.use(errorHandler);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

const call = (method, path, who, body, tenant = 'study') => {
  const req = request(app)[method](path).set('x-tenant', tenant);
  if (who) req.set('Authorization', `Bearer ${tokens[who]}`);
  return body === undefined ? req : req.send(body);
};

describe('study-center expenses', () => {
  test('the owner records an expense: approved at once, no approval chain, however large', async () => {
    const res = await call('post', '/expense/entries', 'admin', {
      category: 'rent',
      amount: 25000,
      date: '2026-11-03',
      paymentMethod: 'bank_transfer',
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ category: 'rent', title: 'rent', status: 'approved' });
    expect(res.body.approvalChain).toEqual([]);
    expect(res.body.invoiceDate).toBe('2026-11-03T00:00:00.000Z');
    expect(auditLog).toHaveBeenCalledWith(expect.objectContaining({ action: 'expense.create' }));
  });

  test('the date defaults to today on the centre calendar', async () => {
    const res = await call('post', '/expense/entries', 'admin', {
      category: 'internet',
      amount: 800,
    });
    expect(res.status).toBe(201);
    expect(res.body.invoiceDate).toMatch(/T00:00:00\.000Z$/);
  });

  test.each([
    ['a category outside the list', { category: 'pizza', amount: 100 }],
    ['a zero amount', { category: 'rent', amount: 0 }],
    ['a negative amount', { category: 'rent', amount: -5 }],
    ['an unknown field', { category: 'rent', amount: 5, status: 'paid' }],
    ['a malformed date', { category: 'rent', amount: 5, date: '03/11/2026' }],
  ])('rejects %s', async (_label, body) => {
    const res = await call('post', '/expense/entries', 'admin', body);
    expect(res.status).toBe(400);
  });

  test('front desk cannot record, edit or delete an expense', async () => {
    const entry = await ExpenseEntry.findOne({ tenantId: tenants.study._id });
    expect(
      (await call('post', '/expense/entries', 'desk', { category: 'rent', amount: 5 })).status
    ).toBe(403);
    expect(
      (await call('patch', `/expense/entries/${entry._id}`, 'desk', { amount: 1 })).status
    ).toBe(403);
    expect((await call('delete', `/expense/entries/${entry._id}`, 'desk')).status).toBe(403);
  });

  test('the owner corrects an approved entry', async () => {
    const entry = await ExpenseEntry.findOne({ tenantId: tenants.study._id, category: 'rent' });
    const res = await call('patch', `/expense/entries/${entry._id}`, 'admin', {
      amount: 26000,
      category: 'maintenance',
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      amount: 26000,
      category: 'maintenance',
      title: 'maintenance',
    });
    expect(res.body.status).toBe('approved');
  });

  test('the owner deletes an entry, audited', async () => {
    const entry = await ExpenseEntry.findOne({ tenantId: tenants.study._id, category: 'internet' });
    const res = await call('delete', `/expense/entries/${entry._id}`, 'admin');
    expect(res.status).toBe(204);
    expect(
      await ExpenseEntry.countDocuments({ _id: entry._id }, { _bypassTenantScope: true })
    ).toBe(0);
    expect(auditLog).toHaveBeenCalledWith(expect.objectContaining({ action: 'expense.delete' }));
  });

  test("another centre's entry is invisible: 404 on edit and delete", async () => {
    const entry = await ExpenseEntry.findOne({ tenantId: tenants.study._id });
    expect(
      (await call('patch', `/expense/entries/${entry._id}`, 'admin2', { amount: 1 }, 'study2'))
        .status
    ).toBe(404);
    expect(
      (await call('delete', `/expense/entries/${entry._id}`, 'admin2', undefined, 'study2')).status
    ).toBe(404);
  });

  test('a school keeps the approval flow: a large expense is not auto-approved', async () => {
    const res = await call(
      'post',
      '/expense/entries',
      'schoolAdmin',
      { title: 'Projector', category: 'Equipment', amount: 50000 },
      'school'
    );
    expect(res.status).toBe(201);
    expect(res.body.status).not.toBe('approved');
  });
});
