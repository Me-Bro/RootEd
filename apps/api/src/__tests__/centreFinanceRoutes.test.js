// The owner's money reads (spent, collected, still owed), through a mini Express app
// against an in-memory Mongo. Redis, BullMQ and storage are faked, and Date is fixed
// with fake timers so "this month" on the centre's calendar is stable.
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
jest.unstable_mockModule('../services/storage.service.js', () => ({
  uploadBuffer: jest.fn(async () => undefined),
  getSignedUrl: jest.fn(async (key) => `https://files.test/${key}`),
}));

const { MongoMemoryServer } = await import('mongodb-memory-server');
const { default: mongoose } = await import('mongoose');
const { default: express } = await import('express');
const { default: request } = await import('supertest');
const { Tenant } = await import('../models/Tenant.js');
const { Role, DEFAULT_ROLE_TEMPLATES } = await import('../models/Role.js');
const { User } = await import('../models/User.js');
const { Student } = await import('../models/Student.js');
const { FeeStructure } = await import('../models/FeeStructure.js');
const { FeeAssignment } = await import('../models/FeeAssignment.js');
const { FeePayment } = await import('../models/FeePayment.js');
const { ExpenseEntry } = await import('../models/ExpenseEntry.js');
const { TenantMembership } = await import('../models/TenantMembership.js');
const { default: feeRouter } = await import('../routes/fee.js');
const { default: expenseRouter } = await import('../routes/expense.js');
const { signAccessToken, hashPassword } = await import('../services/auth.service.js');
const { errorHandler } = await import('../middleware/errorHandler.js');

const DO_NOT_FAKE = [
  'hrtime',
  'nextTick',
  'performance',
  'queueMicrotask',
  'requestAnimationFrame',
  'cancelAnimationFrame',
  'requestIdleCallback',
  'cancelIdleCallback',
  'setImmediate',
  'clearImmediate',
  'setInterval',
  'clearInterval',
  'setTimeout',
  'clearTimeout',
];
// 15:30 IST on 19 Nov 2026. Kept earlier than the real clock: the tokens are signed in
// real time, so a fake "now" ahead of it would make every one of them look expired.
const NOW = new Date('2026-11-19T10:00:00Z');

let mongod;
let app;
const tenants = {};
const tokens = {};
const ctx = {};
let n = 0;

async function makeTenant(subdomain, orgType) {
  const tenant = await Tenant.create({
    name: subdomain,
    subdomain,
    orgType,
    timezone: 'Asia/Kolkata',
  });
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
    email: `${label}${n}@finance.test`,
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
  return { user, token: signAccessToken({ sub: user._id.toString() }) };
}

const day = (s) => new Date(`${s}T00:00:00.000Z`);

const mkPlan = async (admissionNo, firstName, from, amount) => {
  const student = await Student.create({
    tenantId: tenants.study._id,
    admissionNo,
    firstName,
    lastName: 'Study',
    phone: '9876500000',
  });
  const plan = await FeeAssignment.create({
    tenantId: tenants.study._id,
    studentId: student._id,
    feeStructureId: ctx.structure._id,
    academicYearId: ctx.year,
    totalAmount: amount,
    billing: {
      segments: [{ feeStructureId: ctx.structure._id, cycle: 'monthly', amount, from: day(from) }],
      pauses: [],
    },
  });
  return { student, plan };
};

let receipt = 0;
const pay = (plan, amount, paymentDate, extra = {}) => {
  receipt += 1;
  return FeePayment.create({
    tenantId: tenants.study._id,
    assignmentId: plan._id,
    studentId: plan.studentId,
    amount,
    paymentMethod: 'cash',
    receiptNumber: `RCP-F-${receipt}`,
    paymentDate: new Date(paymentDate),
    collectedBy: ctx.owner._id,
    ...extra,
  });
};

const spend = (category, amount, date, extra = {}) =>
  ExpenseEntry.create({
    tenantId: tenants.study._id,
    title: category,
    category,
    amount,
    invoiceDate: day(date),
    submittedBy: ctx.owner._id,
    status: 'approved',
    ...extra,
  });

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  await Promise.all([FeePayment.syncIndexes(), FeeAssignment.syncIndexes()]);

  const study = await makeTenant('finance-study', 'study_center');
  const study2 = await makeTenant('finance-study2', 'study_center');
  const tuition = await makeTenant('finance-tuition', 'tuition_center');
  tenants.study = study.tenant;
  tenants.study2 = study2.tenant;
  tenants.tuition = tuition.tenant;

  const owner = await makeMember(study.tenant, study.roles.tenant_admin, 'owner');
  ctx.owner = owner.user;
  tokens.owner = owner.token;
  tokens.desk = (await makeMember(study.tenant, study.roles.front_desk, 'desk')).token;
  tokens.teacher = (await makeMember(study.tenant, study.roles.teacher, 'teacher')).token;
  tokens.owner2 = (await makeMember(study2.tenant, study2.roles.tenant_admin, 'owner2')).token;
  tokens.tuitionOwner = (
    await makeMember(tuition.tenant, tuition.roles.tenant_admin, 'tuiown')
  ).token;

  ctx.year = new mongoose.Types.ObjectId();
  ctx.structure = await FeeStructure.create({
    tenantId: study.tenant._id,
    name: 'Seat monthly',
    academicYearId: ctx.year,
    components: [{ label: 'Monthly', amount: 1000 }],
    cycle: 'monthly',
  });

  // Asha started 1 Oct on 1000/month and paid 400 (Oct is short by 600; Nov is unpaid).
  // Ravi started 1 Nov on 800/month and is paid in full; one of his payments was refunded.
  ctx.asha = await mkPlan('S-1', 'Asha', '2026-10-01', 1000);
  ctx.ravi = await mkPlan('S-2', 'Ravi', '2026-11-01', 800);
  await pay(ctx.asha.plan, 400, '2026-10-05T10:00:00Z');
  await pay(ctx.ravi.plan, 800, '2026-11-02T10:00:00Z', { paymentMethod: 'upi' });
  await pay(ctx.ravi.plan, 200, '2026-11-03T10:00:00Z', { refunded: true });

  await spend('rent', 20000, '2026-10-03');
  await spend('rent', 20000, '2026-11-03');
  await spend('electricity', 3000, '2026-11-12');
  await spend('rent', 999, '2026-11-04', { status: 'rejected' });

  // Another centre's money must never appear.
  const other = await Student.create({
    tenantId: study2.tenant._id,
    admissionNo: 'O-1',
    firstName: 'Outsider',
    lastName: 'Study',
  });
  await ExpenseEntry.create({
    tenantId: study2.tenant._id,
    title: 'rent',
    category: 'rent',
    amount: 777,
    invoiceDate: day('2026-11-03'),
    submittedBy: ctx.owner._id,
    status: 'approved',
  });
  await FeePayment.create({
    tenantId: study2.tenant._id,
    assignmentId: new mongoose.Types.ObjectId(),
    studentId: other._id,
    amount: 555,
    paymentMethod: 'cash',
    receiptNumber: 'RCP-OTHER',
    paymentDate: new Date('2026-11-05T10:00:00Z'),
    collectedBy: ctx.owner._id,
  });

  app = express();
  app.use(express.json());
  app.use(async (req, _res, next) => {
    req.tenant = await Tenant.findById(tenants[req.headers['x-tenant'] ?? 'study']._id).lean();
    next();
  });
  app.use('/fee', feeRouter);
  app.use('/expense', expenseRouter);
  app.use(errorHandler);
});

afterAll(async () => {
  jest.useRealTimers();
  await mongoose.disconnect();
  await mongod.stop();
});

beforeEach(() => jest.useFakeTimers({ now: NOW, doNotFake: DO_NOT_FAKE }));
afterEach(() => jest.useRealTimers());

const get = (path, who, tenant = 'study') => {
  const req = request(app).get(path).set('x-tenant', tenant);
  if (who) req.set('Authorization', `Bearer ${tokens[who]}`);
  return req;
};

describe('GET /expense/summary', () => {
  test('defaults to this month on the centre calendar: approved spend by category, rejected left out', async () => {
    const res = await get('/expense/summary', 'owner');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      month: '2026-11',
      total: 23000,
      count: 2,
      categories: [
        { category: 'rent', total: 20000, count: 1 },
        { category: 'electricity', total: 3000, count: 1 },
      ],
    });
    expect(res.body.trend).toHaveLength(6);
    expect(res.body.trend.slice(-2)).toEqual([
      { month: '2026-10', total: 20000 },
      { month: '2026-11', total: 23000 },
    ]);
  });

  test('another month on request', async () => {
    const res = await get('/expense/summary?month=2026-10', 'owner');
    expect(res.body).toMatchObject({ month: '2026-10', total: 20000, count: 1 });
  });

  test('rejects a malformed month', async () => {
    expect((await get('/expense/summary?month=2026-13', 'owner')).status).toBe(400);
    expect((await get('/expense/summary?month=Nov', 'owner')).status).toBe(400);
  });

  test('front desk has no expense access; a tuition centre has no such report', async () => {
    expect((await get('/expense/summary', 'desk')).status).toBe(403);
    expect((await get('/expense/summary', 'tuitionOwner', 'tuition')).status).toBe(403);
  });
});

describe('GET /fee/reports/monthly-collection', () => {
  test('sums the month by method and leaves the refunded payment out', async () => {
    const res = await get('/fee/reports/monthly-collection', 'owner');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      month: '2026-11',
      total: 800,
      count: 1,
      methods: [{ method: 'upi', total: 800, count: 1 }],
    });
    expect(res.body.trend.slice(-2)).toEqual([
      { month: '2026-10', total: 400 },
      { month: '2026-11', total: 800 },
    ]);
  });

  test('is the owner’s alone', async () => {
    expect((await get('/fee/reports/monthly-collection', 'desk')).status).toBe(403);
    expect((await get('/fee/reports/monthly-collection', 'teacher')).status).toBe(403);
    expect((await get('/fee/reports/monthly-collection', 'tuitionOwner', 'tuition')).status).toBe(
      403
    );
  });
});

describe('GET /fee/reports/finance-overview', () => {
  test('collected, spent, net, and what is owed now', async () => {
    const res = await get('/fee/reports/finance-overview', 'owner');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      month: '2026-11',
      collected: 800,
      spent: 23000,
      net: -22200,
      owed: { pending: 1600, overdue: 600, learnersOwing: 1 },
    });
    expect(res.body.trend.slice(-2)).toEqual([
      { month: '2026-10', collected: 400, spent: 20000, net: -19600 },
      { month: '2026-11', collected: 800, spent: 23000, net: -22200 },
    ]);
  });

  test('another centre’s expenses and payments never reach it (T1)', async () => {
    const res = await get('/fee/reports/finance-overview', 'owner2', 'study2');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      collected: 555,
      spent: 777,
      owed: { pending: 0, overdue: 0, learnersOwing: 0 },
    });
  });

  test('front desk is refused', async () => {
    expect((await get('/fee/reports/finance-overview', 'desk')).status).toBe(403);
  });
});

describe('GET /fee/reports/pending', () => {
  test('student-wise: only learners who owe, from the computed ledger', async () => {
    const res = await get('/fee/reports/pending', 'owner');
    expect(res.status).toBe(200);
    expect(res.body.totals).toEqual({ pending: 1600, overdue: 600, learnersOwing: 1 });
    expect(res.body.learners).toHaveLength(1);
    expect(res.body.learners[0]).toMatchObject({
      name: 'Asha Study',
      admissionNo: 'S-1',
      phone: '9876500000',
      overdue: 600,
      current: 1000,
      pending: 1600,
      oldestMonth: '2026-10',
    });
  });

  test('search narrows by name, admission number or phone', async () => {
    expect((await get('/fee/reports/pending?q=asha', 'owner')).body.learners).toHaveLength(1);
    expect((await get('/fee/reports/pending?q=S-1', 'owner')).body.learners).toHaveLength(1);
    expect((await get('/fee/reports/pending?q=ravi', 'owner')).body.learners).toHaveLength(0);
  });

  test('month-wise: billed, paid and pending per month, newest first', async () => {
    const res = await get('/fee/reports/pending?view=month', 'owner');
    expect(res.status).toBe(200);
    expect(res.body.months).toEqual([
      {
        month: '2026-11',
        billed: 1800,
        paid: 800,
        pending: 1000,
        learnersOwing: 1,
        status: 'running',
      },
      {
        month: '2026-10',
        billed: 1000,
        paid: 400,
        pending: 600,
        learnersOwing: 1,
        status: 'closed',
      },
    ]);
  });

  test('front desk may read it (they collect); a teacher and a tuition centre may not', async () => {
    expect((await get('/fee/reports/pending', 'desk')).status).toBe(200);
    expect((await get('/fee/reports/pending', 'teacher')).status).toBe(403);
    expect((await get('/fee/reports/pending', 'tuitionOwner', 'tuition')).status).toBe(403);
  });

  test('another centre sees none of these learners (T1)', async () => {
    const res = await get('/fee/reports/pending', 'owner2', 'study2');
    expect(res.body.learners).toEqual([]);
  });

  test('rejects an unknown view', async () => {
    expect((await get('/fee/reports/pending?view=year', 'owner')).status).toBe(400);
  });
});
