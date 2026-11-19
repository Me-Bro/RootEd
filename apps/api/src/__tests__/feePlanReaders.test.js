// Study-center fee plans (TICKET-008 phase 4): every reader of what a learner owes
// works it out from the plan's ledger — the ledger route, fee assignment balances,
// entitlement, the learner's /me/seat and /me/fees, and the collection summary.
// Driven through mini Express apps against an in-memory Mongo; Redis, BullMQ and
// storage are faked.
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
  getSignedUrl: jest.fn(async (k) => `https://files.test/${k}`),
}));

const { MongoMemoryServer } = await import('mongodb-memory-server');
const { default: mongoose } = await import('mongoose');
const { default: express } = await import('express');
const { default: request } = await import('supertest');
const { Tenant } = await import('../models/Tenant.js');
const { Role, DEFAULT_ROLE_TEMPLATES } = await import('../models/Role.js');
const { User } = await import('../models/User.js');
const { Student } = await import('../models/Student.js');
const { AcademicYear } = await import('../models/AcademicYear.js');
const { FeeStructure } = await import('../models/FeeStructure.js');
const { FeeAssignment } = await import('../models/FeeAssignment.js');
const { FeePayment } = await import('../models/FeePayment.js');
const { FeeDiscount } = await import('../models/FeeDiscount.js');
const { TenantMembership } = await import('../models/TenantMembership.js');
const { default: feeRouter } = await import('../routes/fee.js');
const { default: meRouter } = await import('../routes/me.js');
const { signAccessToken, hashPassword } = await import('../services/auth.service.js');
const { errorHandler } = await import('../middleware/errorHandler.js');
const { dayStringInTz, addDaysToDayString } = await import('../utils/dayKey.js');

let mongod;
let app;
const tenants = {};
const tokens = {};
const ctx = {};
let n = 0;

// The centre's calendar (IST): the 1st of last month, and the last day of last month.
const today = () => dayStringInTz(new Date(), 'Asia/Kolkata');
const firstOfThisMonth = () => `${today().slice(0, 8)}01`;
const lastOfLastMonth = () => addDaysToDayString(firstOfThisMonth(), -1);
const firstOfLastMonth = () => `${lastOfLastMonth().slice(0, 8)}01`;
const key = (s) => new Date(`${s}T00:00:00Z`);

async function makeTenant(subdomain, orgType) {
  const tenant = await Tenant.create({ name: subdomain, subdomain, orgType });
  const roles = {};
  for (const [k, permissions] of Object.entries(DEFAULT_ROLE_TEMPLATES)) {
    roles[k] = await Role.create({ tenantId: tenant._id, name: k, templateKey: k, permissions });
  }
  const year = await AcademicYear.create({
    tenantId: tenant._id,
    name: 'Ongoing',
    startDate: new Date('2026-01-01'),
    endDate: new Date('2036-01-01'),
    isActive: true,
  });
  return { tenant, roles, year };
}

async function makeMember(tenant, role, label) {
  n += 1;
  const user = await User.create({
    email: `${label}${n}@readers.test`,
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

// A learner on the monthly plan since the 1st of last month: last month (1500) is
// closed and overdue, this month (1500) is current.
async function learnerOnPlan(label, extra = {}) {
  const student = await Student.create({
    tenantId: tenants.study._id,
    admissionNo: label,
    firstName: 'L',
    lastName: label,
    ...extra,
  });
  const plan = await FeeAssignment.create({
    tenantId: tenants.study._id,
    studentId: student._id,
    feeStructureId: ctx.monthly._id,
    academicYearId: ctx.year._id,
    totalAmount: 1500,
    billing: {
      segments: [
        {
          feeStructureId: ctx.monthly._id,
          cycle: 'monthly',
          amount: 1500,
          from: key(firstOfLastMonth()),
        },
      ],
      pauses: [],
    },
  });
  return { student, plan };
}

const pay = (plan, amount) =>
  FeePayment.create({
    tenantId: tenants.study._id,
    assignmentId: plan._id,
    studentId: plan.studentId,
    amount,
    paymentMethod: 'cash',
    receiptNumber: `R-${++n}`,
    collectedBy: new mongoose.Types.ObjectId(),
  });

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  await Promise.all([Student.syncIndexes(), FeeAssignment.syncIndexes(), FeePayment.syncIndexes()]);

  for (const [k, sub, orgType] of [
    ['study', 'readers-study', 'study_center'],
    ['study2', 'readers-study2', 'study_center'],
    ['school', 'readers-school', 'school'],
  ]) {
    const made = await makeTenant(sub, orgType);
    tenants[k] = made.tenant;
    ctx[`roles_${k}`] = made.roles;
    if (k === 'study') ctx.year = made.year;
  }
  tokens.owner = (await makeMember(tenants.study, ctx.roles_study.tenant_admin, 'owner')).token;
  tokens.desk = (await makeMember(tenants.study, ctx.roles_study.front_desk, 'desk')).token;
  tokens.teacher = (await makeMember(tenants.study, ctx.roles_study.teacher, 'teacher')).token;
  tokens.owner2 = (await makeMember(tenants.study2, ctx.roles_study2.tenant_admin, 'owner2')).token;
  tokens.schoolAdmin = (
    await makeMember(tenants.school, ctx.roles_school.tenant_admin, 'sadmin')
  ).token;
  const learnerLogin = await makeMember(tenants.study, ctx.roles_study.student, 'learner');
  tokens.learner = learnerLogin.token;

  ctx.monthly = await FeeStructure.create({
    tenantId: tenants.study._id,
    name: 'Seat monthly',
    academicYearId: ctx.year._id,
    applicableTo: 'student',
    cycle: 'monthly',
    components: [{ label: 'Seat', amount: 1500 }],
  });

  ctx.me = await learnerOnPlan('ME-1', { userId: learnerLogin.user._id });
  await FeeDiscount.create({
    tenantId: tenants.study._id,
    name: 'Secret family note',
    type: 'percentage',
    value: 10,
    applicableTo: 'student',
    studentId: ctx.me.student._id,
    academicYearId: ctx.year._id,
    validTo: new Date('2099-12-31'),
  });

  app = express();
  app.use(express.json());
  app.use(async (req, _res, next) => {
    req.tenant = await Tenant.findById(tenants[req.headers['x-tenant'] ?? 'study']._id).lean();
    next();
  });
  app.use('/fee', feeRouter);
  app.use('/me', meRouter);
  app.use(errorHandler);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

const call = (method, path, who, tenant = 'study') =>
  request(app)[method](path).set('x-tenant', tenant).set('Authorization', `Bearer ${tokens[who]}`);

describe('GET /fee/students/:id/billing', () => {
  test('returns the plan, its timeline in centre days and the computed ledger', async () => {
    const { student } = await learnerOnPlan('LG-1');
    const res = await call('get', `/fee/students/${student._id}/billing`, 'desk');
    expect(res.status).toBe(200);
    const { plan } = res.body;
    expect(plan).toMatchObject({
      name: 'Seat monthly',
      cycle: 'monthly',
      state: 'active',
      overdue: 1500,
      current: 1500,
      credit: 0,
      payableNow: 3000,
      nextDue: { amount: 1500, dueOn: lastOfLastMonth() },
      pauses: [],
      endedOn: null,
    });
    expect(plan.segments).toEqual([
      expect.objectContaining({
        name: 'Seat monthly',
        amount: 1500,
        from: firstOfLastMonth(),
        to: null,
      }),
    ]);
    expect(plan.cycles[0]).toMatchObject({ start: firstOfLastMonth(), phase: 'closed', net: 1500 });
    expect(plan.cycles[1]).toMatchObject({ start: firstOfThisMonth(), phase: 'current' });
  });

  test('a learner with no plan has { plan: null }', async () => {
    const s = await Student.create({
      tenantId: tenants.study._id,
      admissionNo: 'LG-2',
      firstName: 'No',
      lastName: 'Plan',
    });
    expect((await call('get', `/fee/students/${s._id}/billing`, 'owner')).body).toEqual({
      plan: null,
    });
  });

  test('needs fees:read at a study center, and never reaches another centre (T1)', async () => {
    const { student } = await learnerOnPlan('LG-3');
    expect((await call('get', `/fee/students/${student._id}/billing`, 'teacher')).status).toBe(403);
    expect(
      (await call('get', `/fee/students/${student._id}/billing`, 'schoolAdmin', 'school')).status
    ).toBe(403);
    const other = await call('get', `/fee/students/${student._id}/billing`, 'owner2', 'study2');
    expect(other.body).toEqual({ plan: null });
  });
});

describe('fee assignment balances (withBalances)', () => {
  test("a plan's balance due is what is overdue on its ledger", async () => {
    const { student, plan } = await learnerOnPlan('BAL-1');
    await pay(plan, 1000);
    const res = await call('get', `/fee/assignments?studentId=${student._id}`, 'owner');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({
      paidAmount: 1000,
      balanceDue: 500,
      ledger: { state: 'active', overdue: 500, current: 1500, payableNow: 2000 },
    });
    // A tenant-wide list carries the balances, not every cycle.
    expect(res.body[0].ledger.cycles).toBeUndefined();
  });

  test('paying ahead leaves nothing due and shows the credit', async () => {
    const { student, plan } = await learnerOnPlan('BAL-2');
    await pay(plan, 3000);
    const [row] = (await call('get', `/fee/assignments?studentId=${student._id}`, 'owner')).body;
    expect(row).toMatchObject({ balanceDue: 0, ledger: { overdue: 0, payableNow: 0 } });
  });
});

describe('entitlement', () => {
  const ent = (s) => call('get', `/fee/entitlement?studentId=${s._id}`, 'desk');

  test('unpaid when a closed cycle is owed, valid once it is paid', async () => {
    const { student, plan } = await learnerOnPlan('EN-1');
    expect((await ent(student)).body).toMatchObject({ status: 'unpaid', overdue: 1500 });
    await pay(plan, 1500);
    expect((await ent(student)).body).toMatchObject({ status: 'valid', overdue: 0 });
  });

  test('paused, ended and scheduled come from the plan', async () => {
    const paused = await learnerOnPlan('EN-2');
    await FeeAssignment.updateOne(
      { _id: paused.plan._id, tenantId: tenants.study._id },
      { $push: { 'billing.pauses': { from: key(firstOfThisMonth()) } } }
    );
    expect((await ent(paused.student)).body.status).toBe('paused');

    const ended = await learnerOnPlan('EN-3');
    await FeeAssignment.updateOne(
      { _id: ended.plan._id, tenantId: tenants.study._id },
      { $set: { 'billing.endedOn': key(firstOfThisMonth()) } }
    );
    expect((await ent(ended.student)).body.status).toBe('ended');

    const later = await learnerOnPlan('EN-4');
    await FeeAssignment.updateOne(
      { _id: later.plan._id, tenantId: tenants.study._id },
      { $set: { 'billing.segments.0.from': key(addDaysToDayString(today(), 40)) } }
    );
    expect((await ent(later.student)).body.status).toBe('scheduled');
  });
});

describe("the learner's own pages", () => {
  test('/me/seat shows the plan, its state and the next due from the ledger', async () => {
    const res = await call('get', '/me/seat', 'learner');
    expect(res.status).toBe(200);
    expect(res.body.plan).toEqual({ name: 'Seat monthly', cycle: 'monthly', state: 'active' });
    // Last month, with the 10% standing discount.
    expect(res.body.nextDue.amount).toBe(1350);
    expect(new Date(res.body.nextDue.dueDate).toISOString().slice(0, 10)).toBe(lastOfLastMonth());
    // The discount's name is a staff note, never shown to the learner.
    expect(JSON.stringify(res.body)).not.toMatch(/Secret family note/);
  });

  test('/me/fees lists the plan with every cycle', async () => {
    const res = await call('get', '/me/fees', 'learner');
    expect(res.status).toBe(200);
    const plan = res.body.assignments.find((a) => a.billing);
    expect(plan.balanceDue).toBe(1350);
    expect(plan.ledger.cycles.map((c) => c.start)).toEqual([
      firstOfLastMonth(),
      firstOfThisMonth(),
    ]);
    expect(plan.ledger.cycles[0]).toMatchObject({ charge: 1500, discount: 150, net: 1350 });
    expect(JSON.stringify(res.body)).not.toMatch(/Secret family note/);
  });
});

describe('collection summary', () => {
  test('a plan contributes what has been billed so far, what was paid and what is overdue', async () => {
    const sub = await makeTenant('readers-summary', 'study_center');
    const owner = (await makeMember(sub.tenant, sub.roles.tenant_admin, 'sowner')).token;
    const structure = await FeeStructure.create({
      tenantId: sub.tenant._id,
      name: 'Seat monthly',
      academicYearId: sub.year._id,
      applicableTo: 'student',
      cycle: 'monthly',
      components: [{ label: 'Seat', amount: 1500 }],
    });
    const student = await Student.create({
      tenantId: sub.tenant._id,
      admissionNo: 'CS-1',
      firstName: 'C',
      lastName: 'S',
    });
    const plan = await FeeAssignment.create({
      tenantId: sub.tenant._id,
      studentId: student._id,
      feeStructureId: structure._id,
      academicYearId: sub.year._id,
      totalAmount: 1500,
      billing: {
        segments: [
          {
            feeStructureId: structure._id,
            cycle: 'monthly',
            amount: 1500,
            from: key(firstOfLastMonth()),
          },
        ],
        pauses: [],
      },
    });
    await FeePayment.create({
      tenantId: sub.tenant._id,
      assignmentId: plan._id,
      studentId: student._id,
      amount: 500,
      paymentMethod: 'cash',
      receiptNumber: 'R-CS-1',
      collectedBy: new mongoose.Types.ObjectId(),
    });
    tenants.summary = sub.tenant;
    tokens.summaryOwner = owner;

    const res = await call('get', '/fee/collection-summary', 'summaryOwner', 'summary');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      totalAssigned: 3000,
      totalCollected: 500,
      overdueTotal: 1000,
      defaulterCount: 0,
    });
  });
});
