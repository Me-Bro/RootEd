// Study-center fee plans (TICKET-008 phase 2): cycle structures, putting a learner on a
// plan from a start date, changing it, one-off fees alongside it, and paying against
// it. Driven through a mini Express app against an in-memory Mongo; Redis, BullMQ and
// object storage are faked.
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
const lateCharges = jest.fn();
jest.unstable_mockModule('bullmq', () => ({
  Queue: class {
    add(...args) {
      lateCharges(...args);
    }
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
const { AcademicYear } = await import('../models/AcademicYear.js');
const { FeeStructure } = await import('../models/FeeStructure.js');
const { FeeAssignment } = await import('../models/FeeAssignment.js');
const { FeePayment } = await import('../models/FeePayment.js');
const { FeeDiscount } = await import('../models/FeeDiscount.js');
const { TenantMembership } = await import('../models/TenantMembership.js');
const { default: feeRouter } = await import('../routes/fee.js');
const { signAccessToken, hashPassword } = await import('../services/auth.service.js');
const { errorHandler } = await import('../middleware/errorHandler.js');
const { dayStringInTz, addDaysToDayString } = await import('../utils/dayKey.js');
const { getDefaulters } = await import('../services/fee.service.js');

let mongod;
let app;
const tenants = {};
const tokens = {};
const ctx = {};
let n = 0;

// The centre's own today (IST), and days around it, as stored day keys.
const today = () => dayStringInTz(new Date(), 'Asia/Kolkata');
const dayOffset = (k) => addDaysToDayString(today(), k);
const key = (s) => new Date(`${s}T00:00:00Z`).toISOString();

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
    email: `${label}${n}@plan.test`,
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

const mkStudent = (tenant, admissionNo, extra = {}) =>
  Student.create({
    tenantId: tenant._id,
    admissionNo,
    firstName: 'L',
    lastName: admissionNo,
    ...extra,
  });

const mkStructure = (tenantKey, name, amount, extra = {}) =>
  FeeStructure.create({
    tenantId: tenants[tenantKey]._id,
    name,
    academicYearId: ctx.years[tenantKey]._id,
    applicableTo: 'student',
    components: [{ label: name, amount }],
    ...extra,
  });

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  await Promise.all([Student.syncIndexes(), FeeAssignment.syncIndexes(), FeePayment.syncIndexes()]);

  ctx.years = {};
  for (const [k, sub, orgType] of [
    ['study', 'plan-study', 'study_center'],
    ['study2', 'plan-study2', 'study_center'],
    ['school', 'plan-school', 'school'],
  ]) {
    const made = await makeTenant(sub, orgType);
    tenants[k] = made.tenant;
    ctx.years[k] = made.year;
    ctx[`roles_${k}`] = made.roles;
  }
  tokens.owner = await makeMember(tenants.study, ctx.roles_study.tenant_admin, 'owner');
  tokens.desk = await makeMember(tenants.study, ctx.roles_study.front_desk, 'desk');
  tokens.accountant = await makeMember(tenants.study, ctx.roles_study.accountant, 'acct');
  tokens.schoolAdmin = await makeMember(tenants.school, ctx.roles_school.tenant_admin, 'sadmin');

  ctx.monthly = await mkStructure('study', 'Seat monthly', 1500, { cycle: 'monthly' });
  ctx.weekly = await mkStructure('study', 'Seat weekly', 400, { cycle: 'weekly' });
  ctx.registration = await mkStructure('study', 'Registration', 500);
  ctx.locker = await mkStructure('study', 'Locker', 200);
  ctx.dayPass = await mkStructure('study', 'Day pass', 150, {
    plan: { kind: 'day_pass', durationDays: 1 },
  });
  ctx.foreign = await mkStructure('study2', 'Foreign monthly', 999, { cycle: 'monthly' });

  app = express();
  app.use(express.json());
  app.use(async (req, _res, next) => {
    req.tenant = await Tenant.findById(tenants[req.headers['x-tenant'] ?? 'study']._id).lean();
    next();
  });
  app.use('/fee', feeRouter);
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
const setStructure = (student, structure, extra = {}, who = 'owner') =>
  call('put', `/fee/students/${student._id}/structure`, who, {
    feeStructureId: String(structure._id),
    ...extra,
  });
const planOf = (student) =>
  FeeAssignment.findOne({
    tenantId: tenants.study._id,
    studentId: student._id,
    billing: { $exists: true },
  }).lean();

describe('cycle structures', () => {
  const body = (extra) => ({
    name: `S-${++n}`,
    academicYearId: String(ctx.years.study._id),
    components: [{ label: 'Seat', amount: 1500 }],
    ...extra,
  });

  test('a study center creates a monthly structure, set per learner and assigned to nobody', async () => {
    const res = await call('post', '/fee/structures', 'owner', body({ cycle: 'monthly' }));
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ cycle: 'monthly', applicableTo: 'student' });
    expect(res.body.autoAssign).toEqual({ created: 0, skipped: 0 });
  });

  test('a school cannot create one', async () => {
    const res = await call(
      'post',
      '/fee/structures',
      'schoolAdmin',
      { ...body({ cycle: 'monthly' }), academicYearId: String(ctx.years.school._id) },
      'school'
    );
    expect(res.status).toBe(400);
  });

  test('a cycle cannot be added to a desk plan by editing it', async () => {
    const res = await call('patch', `/fee/structures/${ctx.dayPass._id}`, 'owner', {
      cycle: 'monthly',
    });
    expect(res.status).toBe(400);
  });
});

describe('putting a learner on a fee plan', () => {
  test('defaults to today, records one segment, no due date and no late fee', async () => {
    const s = await mkStudent(tenants.study, 'P-1');
    lateCharges.mockClear();
    const res = await setStructure(s, ctx.monthly);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ kind: 'plan', result: 'created' });

    const plan = await planOf(s);
    expect(plan.billing.segments).toHaveLength(1);
    expect(plan.billing.segments[0]).toMatchObject({ cycle: 'monthly', amount: 1500 });
    expect(plan.billing.segments[0].from.toISOString()).toBe(key(today()));
    expect(plan.dueDate).toBeUndefined();
    expect(plan.totalAmount).toBe(1500);
    expect(lateCharges).not.toHaveBeenCalled();
  });

  test('R3/EH5: 31 days back is allowed, 32 is refused; a future day is allowed (EH4)', async () => {
    const a = await mkStudent(tenants.study, 'P-2');
    expect((await setStructure(a, ctx.monthly, { startDate: dayOffset(-32) })).status).toBe(422);
    expect(await planOf(a)).toBeNull();
    expect((await setStructure(a, ctx.monthly, { startDate: dayOffset(-31) })).status).toBe(201);

    const b = await mkStudent(tenants.study, 'P-3');
    expect((await setStructure(b, ctx.monthly, { startDate: dayOffset(40) })).status).toBe(201);
    expect((await planOf(b)).billing.segments[0].from.toISOString()).toBe(key(dayOffset(40)));
  });

  test('the same structure again changes nothing', async () => {
    const s = await mkStudent(tenants.study, 'P-4');
    await setStructure(s, ctx.monthly, { startDate: dayOffset(-10) });
    auditLog.mockClear();
    const res = await setStructure(s, ctx.monthly);
    expect(res.status).toBe(200);
    expect(res.body.result).toBe('unchanged');
    expect(auditLog).not.toHaveBeenCalled();
  });

  test('EH6: a change closes the current structure and opens the new one on that day', async () => {
    const s = await mkStudent(tenants.study, 'P-5');
    await setStructure(s, ctx.monthly, { startDate: dayOffset(-20) });
    const res = await setStructure(s, ctx.weekly, { startDate: dayOffset(-5) });
    expect(res.status).toBe(200);
    expect(res.body.result).toBe('changed');

    const plan = await planOf(s);
    const [first, second] = plan.billing.segments;
    expect(first.to.toISOString()).toBe(key(dayOffset(-5)));
    expect(second).toMatchObject({ cycle: 'weekly', amount: 400 });
    expect(second.from.toISOString()).toBe(key(dayOffset(-5)));
    expect(String(plan.feeStructureId)).toBe(String(ctx.weekly._id));
    expect(plan.totalAmount).toBe(400);
  });

  test('a change cannot start before the current structure did', async () => {
    const s = await mkStudent(tenants.study, 'P-6');
    await setStructure(s, ctx.monthly, { startDate: dayOffset(-5) });
    expect((await setStructure(s, ctx.weekly, { startDate: dayOffset(-6) })).status).toBe(422);
  });

  test('a plan that has not started yet is replaced, keeping its start day', async () => {
    const s = await mkStudent(tenants.study, 'P-7');
    await setStructure(s, ctx.monthly, { startDate: dayOffset(10) });
    await setStructure(s, ctx.weekly);
    const plan = await planOf(s);
    expect(plan.billing.segments).toHaveLength(1);
    expect(plan.billing.segments[0]).toMatchObject({ cycle: 'weekly' });
    expect(plan.billing.segments[0].from.toISOString()).toBe(key(dayOffset(10)));
  });

  test('a later price edit does not change the snapshotted amount', async () => {
    const s = await mkStudent(tenants.study, 'P-8');
    const pricey = await mkStructure('study', 'Pricey monthly', 2000, { cycle: 'monthly' });
    await setStructure(s, pricey);
    await call('patch', `/fee/structures/${pricey._id}`, 'owner', {
      components: [{ label: 'Seat', amount: 2500 }],
    });
    expect((await planOf(s)).billing.segments[0].amount).toBe(2000);
  });

  test('walk-ins, inactive learners, desk plans and foreign structures are refused', async () => {
    const walkIn = await mkStudent(tenants.study, 'W-1', { kind: 'walk_in', phone: '9876500001' });
    expect((await setStructure(walkIn, ctx.monthly)).status).toBe(400);

    const gone = await mkStudent(tenants.study, 'P-9', { status: 'withdrawn' });
    expect((await setStructure(gone, ctx.monthly)).status).toBe(422);

    const s = await mkStudent(tenants.study, 'P-10');
    expect((await setStructure(s, ctx.dayPass)).status).toBe(404);
    expect((await setStructure(s, ctx.foreign)).status).toBe(404);

    const outsider = await mkStudent(tenants.study2, 'O-1');
    expect((await setStructure(outsider, ctx.monthly)).status).toBe(404);
  });

  test('needs fees:write and a study center', async () => {
    const s = await mkStudent(tenants.study, 'P-11');
    expect((await setStructure(s, ctx.monthly, {}, 'desk')).status).toBe(403);
    const school = await mkStudent(tenants.school, 'SC-1');
    const res = await call(
      'put',
      `/fee/students/${school._id}/structure`,
      'schoolAdmin',
      { feeStructureId: String(ctx.monthly._id) },
      'school'
    );
    expect(res.status).toBe(403);
  });

  test('the lump-sum roster assignment refuses a cycle structure', async () => {
    const { assignFeesToStudents } = await import('../services/fee.service.js');
    const s = await mkStudent(tenants.study, 'P-12');
    await expect(
      assignFeesToStudents({
        studentIds: [s._id],
        feeStructureId: ctx.monthly._id,
        tenantId: tenants.study._id,
      })
    ).rejects.toMatchObject({ status: 422 });
  });
});

describe('R13: one-off fees alongside the plan', () => {
  test('several one-offs coexist with the plan; the same one twice is skipped', async () => {
    const s = await mkStudent(tenants.study, 'O-10');
    await setStructure(s, ctx.monthly);
    const reg = await setStructure(s, ctx.registration);
    expect(reg.body).toMatchObject({ kind: 'one_off', created: 1 });
    expect((await setStructure(s, ctx.locker)).body.created).toBe(1);
    expect((await setStructure(s, ctx.registration)).body).toMatchObject({
      created: 0,
      skipped: 1,
    });

    const rows = await FeeAssignment.find({ tenantId: tenants.study._id, studentId: s._id }).lean();
    expect(rows).toHaveLength(3);
  });

  test('a one-off is removable until something is paid against it', async () => {
    const s = await mkStudent(tenants.study, 'O-11');
    await setStructure(s, ctx.monthly);
    await setStructure(s, ctx.registration);
    await setStructure(s, ctx.locker);
    const rows = await FeeAssignment.find({ tenantId: tenants.study._id, studentId: s._id }).lean();
    const reg = rows.find((r) => String(r.feeStructureId) === String(ctx.registration._id));
    const locker = rows.find((r) => String(r.feeStructureId) === String(ctx.locker._id));
    const plan = rows.find((r) => r.billing);

    const pay = await call('post', '/fee/payments', 'owner', {
      assignmentId: String(locker._id),
      amount: 200,
      paymentMethod: 'cash',
    });
    expect(pay.status).toBe(201);

    const del = (id) => call('delete', `/fee/students/${s._id}/assignments/${id}`, 'owner');
    expect((await del(locker._id)).status).toBe(409);
    expect((await del(plan._id)).status).toBe(422);
    expect((await del(reg._id)).status).toBe(204);
    expect(await FeeAssignment.findOne({ _id: reg._id, tenantId: tenants.study._id })).toBeNull();
  });
});

describe('paying against a fee plan', () => {
  let learner;
  let plan;

  beforeAll(async () => {
    learner = await mkStudent(tenants.study, 'PAY-1');
    // Starts on the 1st of this month in the centre, so the current cycle is a full
    // month of 1500 and nothing is overdue yet.
    const first = `${today().slice(0, 8)}01`;
    await setStructure(learner, ctx.monthly, { startDate: first });
    plan = await planOf(learner);
  });

  const pay = (amount, extra = {}) =>
    call('post', '/fee/payments', 'owner', {
      assignmentId: String(plan._id),
      amount,
      paymentMethod: 'cash',
      ...extra,
    });

  test('AC4: an advance payment up to the current cycle is accepted, more is refused', async () => {
    expect((await pay(1501)).status).toBe(400);
    const ok = await pay(1000);
    expect(ok.status).toBe(201);
    expect(ok.body.receiptUrl).toMatch(/receipts/);
    expect((await pay(501)).status).toBe(400);
    expect((await pay(500)).status).toBe(201);
    expect((await pay(1)).status).toBe(400);
  });

  test('an installment index is refused', async () => {
    expect((await pay(1, { installmentIndex: 0 })).status).toBe(400);
  });

  test('a fee plan cannot be waived or given an ad hoc discount', async () => {
    const waive = await call('post', `/fee/assignments/${plan._id}/waive`, 'owner', {});
    expect(waive.status).toBe(422);

    const promo = await FeeDiscount.create({
      tenantId: tenants.study._id,
      name: 'Promo',
      type: 'flat',
      value: 100,
      applicableTo: 'all',
      academicYearId: ctx.years.study._id,
    });
    const disc = await call('post', `/fee/assignments/${plan._id}/discount`, 'owner', {
      discountId: String(promo._id),
    });
    expect(disc.status).toBe(422);
  });

  test('the stored status is left alone and the plan never shows as a defaulter', async () => {
    const fresh = await FeeAssignment.findOne({
      _id: plan._id,
      tenantId: tenants.study._id,
    }).lean();
    expect(fresh.status).toBe('unpaid');
    const defaulters = await getDefaulters(tenants.study._id);
    expect(defaulters.some((d) => String(d._id) === String(plan._id))).toBe(false);
  });

  test('every payment is stored against the plan with a receipt', async () => {
    const payments = await FeePayment.find({
      tenantId: tenants.study._id,
      assignmentId: plan._id,
    }).lean();
    expect(payments.map((p) => p.amount)).toEqual([1000, 500]);
    expect(payments.every((p) => p.receiptPdfKey)).toBe(true);
  });
});
