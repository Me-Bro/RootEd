// GET /academic/students/:id/history through a mini Express app against an in-memory
// Mongo. AuditLog rows are written directly (the queue that normally writes them is
// faked), so the test controls exactly what the route has to read.
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
const { Student } = await import('../models/Student.js');
const { Seat } = await import('../models/Seat.js');
const { Class } = await import('../models/Class.js');
const { Section } = await import('../models/Section.js');
const { AuditLog } = await import('../models/AuditLog.js');
const { TenantMembership } = await import('../models/TenantMembership.js');
const { default: historyRouter } = await import('../routes/studentHistory.js');
const { signAccessToken, hashPassword } = await import('../services/auth.service.js');
const { errorHandler } = await import('../middleware/errorHandler.js');

let mongod;
let app;
const tenants = {};
const tokens = {};
const ctx = {};
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

async function makeMember(tenant, role, label, names = {}) {
  n += 1;
  const user = await User.create({
    email: `${label}${n}@history.test`,
    username: `${label}-${n}`,
    usernameLower: `${label}-${n}`,
    passwordHash: await hashPassword('irrelevant-but-valid'),
    emailVerified: true,
    status: 'active',
    ...names,
  });
  await TenantMembership.create({
    tenantId: tenant._id,
    userId: user._id,
    roleIds: [role._id],
    status: 'active',
  });
  return { user, token: signAccessToken({ sub: user._id.toString() }) };
}

const log = (tenant, actor, studentId, action, extra = {}) =>
  AuditLog.create({
    tenantId: tenant._id,
    actorId: actor._id,
    action,
    studentId,
    target: { model: 'Student', id: studentId },
    ip: '10.0.0.7',
    userAgent: 'jest',
    ...extra,
  });

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());

  const study = await makeTenant('hist-study', 'study_center');
  const other = await makeTenant('hist-other', 'study_center');
  const school = await makeTenant('hist-school', 'school');
  tenants.study = study.tenant;
  tenants.other = other.tenant;
  tenants.school = school.tenant;

  const owner = await makeMember(study.tenant, study.roles.tenant_admin, 'owner', {
    firstName: 'Olivia',
    lastName: 'Owner',
  });
  const desk = await makeMember(study.tenant, study.roles.front_desk, 'desk');
  ctx.owner = owner.user;
  ctx.desk = desk.user;
  tokens.owner = owner.token;
  tokens.desk = desk.token;
  tokens.accountant = (await makeMember(study.tenant, study.roles.accountant, 'acct')).token;
  tokens.pupil = (await makeMember(study.tenant, study.roles.student, 'pupil')).token;
  tokens.otherOwner = (await makeMember(other.tenant, other.roles.tenant_admin, 'oown')).token;
  tokens.schoolAdmin = (await makeMember(school.tenant, school.roles.tenant_admin, 'sadm')).token;

  const mk = (tenant, admissionNo, firstName) =>
    Student.create({ tenantId: tenant._id, admissionNo, firstName, lastName: 'Hist' });
  ctx.asha = await mk(study.tenant, 'H-1', 'Asha');
  ctx.ravi = await mk(study.tenant, 'H-2', 'Ravi');
  ctx.foreign = await mk(other.tenant, 'H-9', 'Zed');
  ctx.schoolKid = await mk(school.tenant, 'H-8', 'Sam');

  const klass = await Class.create({ tenantId: study.tenant._id, name: 'Morning' });
  ctx.morning = await Section.create({
    tenantId: study.tenant._id,
    classId: klass._id,
    name: 'Morning',
  });
  ctx.seat = await Seat.create({ tenantId: study.tenant._id, label: 'A-1' });
  ctx.seat2 = await Seat.create({ tenantId: study.tenant._id, label: 'B-4' });

  app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.tenant = tenants[req.headers['x-tenant'] ?? 'study'];
    next();
  });
  app.use('/academic', historyRouter);
  app.use(errorHandler);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

const get = (path, who, tenant = 'study') => {
  const req = request(app).get(path).set('x-tenant', tenant);
  if (who) req.set('Authorization', `Bearer ${tokens[who]}`);
  return req;
};
const history = (id, who, query = '', tenant) =>
  get(`/academic/students/${id}/history${query}`, who, tenant);

describe('who may read a learner history', () => {
  test('the owner and the front desk can; the response is the entries plus paging', async () => {
    for (const who of ['owner', 'desk']) {
      const res = await history(ctx.asha._id, who);
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ entries: [], total: 0, page: 1, pages: 0 });
    }
  });

  test('a role without students:read, a learner and an anonymous caller cannot', async () => {
    expect((await history(ctx.asha._id, 'accountant')).status).toBe(403);
    expect((await history(ctx.asha._id, 'pupil')).status).toBe(403);
    expect((await history(ctx.asha._id)).status).toBe(401);
  });

  test('only study centers have it', async () => {
    expect((await history(ctx.schoolKid._id, 'schoolAdmin', '', 'school')).status).toBe(403);
  });

  test("another tenant's learner is not found, and a bad id is not found", async () => {
    expect((await history(ctx.foreign._id, 'owner')).status).toBe(404);
    expect((await history(ctx.asha._id, 'otherOwner', '', 'other')).status).toBe(404);
    expect((await history('not-an-id', 'owner')).status).toBe(404);
  });
});

describe('what the history contains', () => {
  beforeAll(async () => {
    const t = tenants.study;
    const day = (d) => new Date(`2026-03-${String(d).padStart(2, '0')}T10:00:00Z`);
    await log(t, ctx.owner, ctx.asha._id, 'student.create', {
      at: day(1),
      after: { admissionNo: 'H-1' },
    });
    await log(t, ctx.desk, ctx.asha._id, 'student.update', {
      at: day(2),
      before: { phone: '111', address: { city: 'Pune' } },
      after: { phone: '222', address: { city: 'Agra' } },
    });
    await log(t, ctx.owner, ctx.asha._id, 'student.status_change', {
      at: day(3),
      before: { status: 'active' },
      after: { status: 'withdrawn', statusReason: 'Moved' },
    });
    await log(t, ctx.desk, ctx.asha._id, 'visit.checkIn', {
      at: day(4),
      target: { model: 'Visit', id: new mongoose.Types.ObjectId() },
      after: { seatId: String(ctx.seat._id), entitlementAtCheckIn: 'valid' },
    });
    await log(t, ctx.desk, ctx.asha._id, 'seatAllocation.move', {
      at: day(5),
      target: { model: 'SeatAllocation', id: new mongoose.Types.ObjectId() },
      before: { seatId: String(ctx.seat._id), sectionId: String(ctx.morning._id) },
      after: { seatId: String(ctx.seat2._id), sectionId: String(ctx.morning._id) },
    });
    await log(t, ctx.desk, ctx.asha._id, 'feePayment.record', {
      at: day(6),
      target: { model: 'FeePayment', id: new mongoose.Types.ObjectId() },
      after: { amount: 400, paymentMethod: 'cash', receiptNumber: 'RCP-2026-00001' },
    });
    // Someone else's, and another tenant's: neither may appear.
    await log(t, ctx.owner, ctx.ravi._id, 'student.update', { at: day(7) });
    await log(tenants.other, ctx.owner, ctx.asha._id, 'student.update', { at: day(8) });
    // An action nobody has written a label for, and one the plugin never saw.
    await log(t, ctx.owner, ctx.asha._id, 'something.new', { at: day(9) });
  });

  test("lists only this learner's entries here, newest first", async () => {
    const res = await history(ctx.asha._id, 'owner');
    expect(res.body.total).toBe(7);
    expect(res.body.entries.map((e) => e.action)).toEqual([
      'something.new',
      'feePayment.record',
      'seatAllocation.move',
      'visit.checkIn',
      'student.status_change',
      'student.update',
      'student.create',
    ]);
  });

  test('names the actor, the seats and the shift', async () => {
    const { entries } = (await history(ctx.asha._id, 'owner')).body;
    const byAction = Object.fromEntries(entries.map((e) => [e.action, e]));
    expect(byAction['student.create'].actor.name).toBe('Olivia Owner');
    // No first or last name: falls back to the username, never the email.
    expect(byAction['student.update'].actor.name).toMatch(/^desk-/);
    expect(byAction['visit.checkIn'].params).toEqual({ seat: 'A-1', entitlement: 'valid' });
    expect(byAction['seatAllocation.move'].params).toEqual({
      from: 'A-1',
      to: 'B-4',
      shift: 'Morning',
    });
    expect(byAction['feePayment.record'].params).toEqual({
      amount: 400,
      method: 'cash',
      receiptNumber: 'RCP-2026-00001',
    });
  });

  test('an edit lists what changed; lists and objects are reported without their contents', async () => {
    const { entries } = (await history(ctx.asha._id, 'owner')).body;
    const update = entries.find((e) => e.action === 'student.update');
    expect(update.params).toEqual({ fields: ['phone', 'address'] });
    expect(update.changes).toEqual([
      { field: 'phone', before: '111', after: '222' },
      { field: 'address', complex: true },
    ]);
    const status = entries.find((e) => e.action === 'student.status_change');
    expect(status.params).toEqual({ from: 'active', to: 'withdrawn', reason: 'Moved' });
  });

  test('an unknown action is shown with no facts, not hidden or failed', async () => {
    const { entries } = (await history(ctx.asha._id, 'owner')).body;
    expect(entries[0]).toMatchObject({ action: 'something.new', type: 'other', params: {} });
  });

  test('the raw before/after and the user agent never leave the server', async () => {
    const res = await history(ctx.asha._id, 'owner');
    for (const entry of res.body.entries) {
      expect(entry).not.toHaveProperty('before');
      expect(entry).not.toHaveProperty('after');
      expect(entry).not.toHaveProperty('userAgent');
    }
    expect(JSON.stringify(res.body)).not.toContain('jest');
  });

  test('the IP is shown to the owner only', async () => {
    const owner = (await history(ctx.asha._id, 'owner')).body.entries[0];
    const desk = (await history(ctx.asha._id, 'desk')).body.entries[0];
    expect(owner.ip).toBe('10.0.0.7');
    expect(desk).not.toHaveProperty('ip');
  });

  test('filters by type', async () => {
    const actions = async (type) =>
      (await history(ctx.asha._id, 'owner', `?type=${type}`)).body.entries.map((e) => e.action);
    expect(await actions('profile')).toEqual([
      'student.status_change',
      'student.update',
      'student.create',
    ]);
    expect(await actions('visit')).toEqual(['visit.checkIn']);
    expect(await actions('seat')).toEqual(['seatAllocation.move']);
    expect(await actions('fee')).toEqual(['feePayment.record']);
  });

  test('pages through the entries', async () => {
    const first = await history(ctx.asha._id, 'owner', '?limit=3');
    expect(first.body).toMatchObject({ total: 7, page: 1, pages: 3 });
    expect(first.body.entries).toHaveLength(3);
    const last = await history(ctx.asha._id, 'owner', '?limit=3&page=3');
    expect(last.body.entries.map((e) => e.action)).toEqual(['student.create']);
  });

  test('a bad type, page or limit is a 400', async () => {
    for (const q of ['?type=bogus', '?page=0', '?limit=500', '?limit=abc']) {
      expect((await history(ctx.asha._id, 'owner', q)).status).toBe(400);
    }
  });
});
