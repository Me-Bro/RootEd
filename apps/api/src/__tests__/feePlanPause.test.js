// Study-center fee plans (TICKET-008 phase 3): the owner pauses and resumes a
// learner's billing (pausing frees their seats), withdrawing ends billing, coming back
// restarts it, and a study center has no `graduated` status. Driven through mini
// Express apps against an in-memory Mongo; Redis, BullMQ and storage are faked.
import { jest } from '@jest/globals';

jest.unstable_mockModule('../services/audit.service.js', () => ({
  auditLog: jest.fn().mockResolvedValue(undefined),
  processAuditLog: jest.fn(),
}));
jest.unstable_mockModule('../config/redis.js', () => ({
  redis: {
    get: jest.fn(async () => null),
    setex: jest.fn(async () => 'OK'),
    set: jest.fn(async () => 'OK'),
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
  deleteObject: jest.fn(async () => undefined),
  getObjectBuffer: jest.fn(async () => null),
}));

const { MongoMemoryServer } = await import('mongodb-memory-server');
const { default: mongoose } = await import('mongoose');
const { default: express } = await import('express');
const { default: request } = await import('supertest');
const { Tenant } = await import('../models/Tenant.js');
const { Role, DEFAULT_ROLE_TEMPLATES } = await import('../models/Role.js');
const { User } = await import('../models/User.js');
const { Student } = await import('../models/Student.js');
const { Class } = await import('../models/Class.js');
const { Section } = await import('../models/Section.js');
const { Enrollment } = await import('../models/Enrollment.js');
const { Seat } = await import('../models/Seat.js');
const { SeatAllocation } = await import('../models/SeatAllocation.js');
const { AcademicYear } = await import('../models/AcademicYear.js');
const { FeeStructure } = await import('../models/FeeStructure.js');
const { FeeAssignment } = await import('../models/FeeAssignment.js');
const { TenantMembership } = await import('../models/TenantMembership.js');
const { default: feeRouter } = await import('../routes/fee.js');
const { default: academicRouter } = await import('../routes/academic.js');
const { signAccessToken, hashPassword } = await import('../services/auth.service.js');
const { errorHandler } = await import('../middleware/errorHandler.js');
const { dayStringInTz, addDaysToDayString } = await import('../utils/dayKey.js');
const { loadBillingLedger } = await import('../services/feePlanLedger.service.js');

let mongod;
let app;
const tenants = {};
const tokens = {};
const ctx = {};
let n = 0;

const today = () => dayStringInTz(new Date(), 'Asia/Kolkata');
const day = (k) => addDaysToDayString(today(), k);
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
    email: `${label}${n}@pause.test`,
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

// A learner enrolled in the Morning shift, optionally holding a seat and on the
// monthly plan from `startDay`.
async function learner(label, { seat, startDay = day(-20), plan = true } = {}) {
  const student = await Student.create({
    tenantId: tenants.study._id,
    admissionNo: label,
    firstName: 'L',
    lastName: label,
    sectionId: ctx.morning._id,
  });
  await Enrollment.create({
    tenantId: tenants.study._id,
    studentId: student._id,
    sectionId: ctx.morning._id,
    status: 'active',
  });
  if (seat) {
    await SeatAllocation.create({
      tenantId: tenants.study._id,
      seatId: seat._id,
      studentId: student._id,
      sectionId: ctx.morning._id,
    });
  }
  if (plan) {
    const res = await call('put', `/fee/students/${student._id}/structure`, 'owner', {
      feeStructureId: String(ctx.monthly._id),
      startDate: startDay,
    });
    expect(res.status).toBe(201);
  }
  return student;
}

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  await Promise.all([
    Student.syncIndexes(),
    FeeAssignment.syncIndexes(),
    SeatAllocation.syncIndexes(),
    Enrollment.syncIndexes(),
  ]);

  for (const [k, sub, orgType] of [
    ['study', 'pause-study', 'study_center'],
    ['study2', 'pause-study2', 'study_center'],
    ['school', 'pause-school', 'school'],
  ]) {
    const made = await makeTenant(sub, orgType);
    tenants[k] = made.tenant;
    ctx[`roles_${k}`] = made.roles;
    ctx[`year_${k}`] = made.year;
  }
  tokens.owner = await makeMember(tenants.study, ctx.roles_study.tenant_admin, 'owner');
  tokens.desk = await makeMember(tenants.study, ctx.roles_study.front_desk, 'desk');
  tokens.accountant = await makeMember(tenants.study, ctx.roles_study.accountant, 'acct');
  tokens.owner2 = await makeMember(tenants.study2, ctx.roles_study2.tenant_admin, 'owner2');
  tokens.schoolAdmin = await makeMember(tenants.school, ctx.roles_school.tenant_admin, 'sadmin');

  const klass = await Class.create({ tenantId: tenants.study._id, name: 'Morning' });
  ctx.morning = await Section.create({
    tenantId: tenants.study._id,
    classId: klass._id,
    name: 'Morning',
  });
  ctx.seatA1 = await Seat.create({ tenantId: tenants.study._id, label: 'A-1' });
  ctx.seatA2 = await Seat.create({ tenantId: tenants.study._id, label: 'A-2' });
  ctx.seatA3 = await Seat.create({ tenantId: tenants.study._id, label: 'A-3' });
  ctx.monthly = await FeeStructure.create({
    tenantId: tenants.study._id,
    name: 'Seat monthly',
    academicYearId: ctx.year_study._id,
    applicableTo: 'student',
    cycle: 'monthly',
    components: [{ label: 'Seat', amount: 1500 }],
  });

  app = express();
  app.use(express.json());
  app.use(async (req, _res, next) => {
    req.tenant = await Tenant.findById(tenants[req.headers['x-tenant'] ?? 'study']._id).lean();
    next();
  });
  app.use('/fee', feeRouter);
  app.use('/academic', academicRouter);
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
const pause = (s, on, who = 'owner', tenant = 'study') =>
  call('post', `/fee/students/${s._id}/pause`, who, { on }, tenant);
const resume = (s, body, who = 'owner') => call('post', `/fee/students/${s._id}/resume`, who, body);
const planOf = (s) =>
  FeeAssignment.findOne({
    tenantId: tenants.study._id,
    studentId: s._id,
    billing: { $exists: true },
  }).lean();
const activeHolds = (filter) =>
  SeatAllocation.countDocuments({ tenantId: tenants.study._id, status: 'active', ...filter });

describe('pause (R8, R9)', () => {
  test('AC5: a back-dated pause is recorded and frees the seat for someone else', async () => {
    const holder = await learner('PA-1', { seat: ctx.seatA1 });
    const res = await pause(holder, day(-2));
    expect(res.status).toBe(200);
    expect(res.body.seatsReleased).toBe(1);
    expect(res.body.billing.pauses).toEqual([{ from: key(day(-2)) }]);
    expect(await activeHolds({ studentId: holder._id })).toBe(0);

    const plan = await planOf(holder);
    const ledger = await loadBillingLedger({ tenant: tenants.study, assignment: plan });
    expect(ledger.state).toBe('paused');

    // The seat can now be given to another learner in the same shift.
    const next = await learner('PA-2', { plan: false });
    await expect(
      SeatAllocation.create({
        tenantId: tenants.study._id,
        seatId: ctx.seatA1._id,
        studentId: next._id,
        sectionId: ctx.morning._id,
      })
    ).resolves.toBeTruthy();
  });

  test('a second pause, a future pause, or one before billing starts is refused', async () => {
    const s = await learner('PA-3');
    expect((await pause(s, day(1))).status).toBe(422);
    expect((await pause(s, day(-21))).status).toBe(422);
    expect((await pause(s, today())).status).toBe(200);
    expect((await pause(s, today())).status).toBe(409);
  });

  test('a learner with no plan has nothing to pause', async () => {
    const s = await learner('PA-4', { plan: false });
    expect((await pause(s, today())).status).toBe(404);
  });
});

describe('resume (R8, R9, EH7)', () => {
  test('resumes from a day between the pause and today, with a free seat', async () => {
    const s = await learner('RE-1', { seat: ctx.seatA2 });
    await pause(s, day(-5));
    expect((await resume(s, { on: day(-6) })).status).toBe(422);
    expect((await resume(s, { on: day(1) })).status).toBe(422);

    const res = await resume(s, {
      on: day(-1),
      seatId: String(ctx.seatA2._id),
      sectionId: String(ctx.morning._id),
    });
    expect(res.status).toBe(200);
    expect(res.body.seatError).toBeUndefined();
    expect(res.body.billing.pauses).toEqual([{ from: key(day(-5)), to: key(day(-1)) }]);
    expect(await activeHolds({ studentId: s._id, seatId: ctx.seatA2._id })).toBe(1);
    expect((await resume(s, { on: today() })).status).toBe(409);
  });

  test('resumes even when the old seat was taken meanwhile, and says so', async () => {
    const s = await learner('RE-2', { seat: ctx.seatA3 });
    await pause(s, day(-3));
    const taker = await learner('RE-3', { plan: false });
    await SeatAllocation.create({
      tenantId: tenants.study._id,
      seatId: ctx.seatA3._id,
      studentId: taker._id,
      sectionId: ctx.morning._id,
    });
    const res = await resume(s, {
      on: today(),
      seatId: String(ctx.seatA3._id),
      sectionId: String(ctx.morning._id),
    });
    expect(res.status).toBe(200);
    expect(res.body.seatError).toMatch(/A-3/);
    expect((await planOf(s)).billing.pauses[0].to.toISOString()).toBe(key(today()));
  });

  test('EH7: a new pause cannot start before the last one ended', async () => {
    const s = await learner('RE-4');
    await pause(s, day(-6));
    await resume(s, { on: day(-3) });
    expect((await pause(s, day(-4))).status).toBe(422);
    expect((await pause(s, day(-3))).status).toBe(200);
  });
});

describe('who may pause and resume (R10, AC6, T1)', () => {
  test('only the owner of a study center', async () => {
    const s = await learner('WHO-1');
    expect((await pause(s, today(), 'desk')).status).toBe(403);
    expect((await pause(s, today(), 'accountant')).status).toBe(403);
    expect((await resume(s, { on: today() }, 'desk')).status).toBe(403);
    expect((await pause(s, today(), 'schoolAdmin', 'school')).status).toBe(403);
  });

  test("another centre's owner cannot reach this learner", async () => {
    const s = await learner('WHO-2');
    expect((await pause(s, today(), 'owner2', 'study2')).status).toBe(404);
    expect((await planOf(s)).billing.pauses).toHaveLength(0);
  });
});

describe('withdrawal ends billing (R12, AC7)', () => {
  const patch = (s, body, who = 'owner', tenant = 'study') =>
    call('patch', `/academic/students/${s._id}`, who, body, tenant);

  test('withdrawing ends billing today and frees the seats; coming back restarts it', async () => {
    const s = await learner('WD-1');
    // A-1 went to someone else in an earlier test; give it to this learner.
    await SeatAllocation.updateMany(
      { tenantId: tenants.study._id, seatId: ctx.seatA1._id, status: 'active' },
      { $set: { status: 'ended' } }
    );
    await SeatAllocation.create({
      tenantId: tenants.study._id,
      seatId: ctx.seatA1._id,
      studentId: s._id,
      sectionId: ctx.morning._id,
    });

    const res = await patch(s, { status: 'withdrawn', statusReason: 'Moved city' });
    expect(res.status).toBe(200);
    const ended = await planOf(s);
    expect(ended.billing.endedOn.toISOString()).toBe(key(today()));
    expect(await activeHolds({ studentId: s._id })).toBe(0);
    const ledger = await loadBillingLedger({ tenant: tenants.study, assignment: ended });
    expect(ledger.state).toBe('ended');

    // Back the same day: billing simply continues, no gap to record.
    expect((await patch(s, { status: 'active' })).status).toBe(200);
    const back = await planOf(s);
    expect(back.billing.endedOn).toBeUndefined();
    expect(back.billing.pauses).toHaveLength(0);
  });

  test('the days away are recorded as a pause, never billed', async () => {
    const s = await learner('WD-2');
    await patch(s, { status: 'withdrawn' });
    // As if they had left five days ago.
    await FeeAssignment.updateOne(
      { tenantId: tenants.study._id, studentId: s._id, billing: { $exists: true } },
      { $set: { 'billing.endedOn': new Date(key(day(-5))) } }
    );
    await patch(s, { status: 'active' });
    const plan = await planOf(s);
    expect(plan.billing.endedOn).toBeUndefined();
    expect(plan.billing.pauses.map((p) => [p.from.toISOString(), p.to.toISOString()])).toEqual([
      [key(day(-5)), key(today())],
    ]);
  });

  test('an open pause is closed when the learner withdraws', async () => {
    const s = await learner('WD-3');
    await pause(s, day(-2));
    await patch(s, { status: 'withdrawn' });
    const plan = await planOf(s);
    expect(plan.billing.pauses[0].to.toISOString()).toBe(key(today()));
    expect(plan.billing.endedOn.toISOString()).toBe(key(today()));
  });

  test('a retry heals a withdrawal that saved the status but never ended billing', async () => {
    const s = await learner('WD-5');
    // As if an earlier request wrote the status and then failed.
    await Student.updateOne({ _id: s._id, tenantId: tenants.study._id }, { status: 'withdrawn' });
    expect((await planOf(s)).billing.endedOn).toBeUndefined();

    expect((await patch(s, { status: 'withdrawn' })).status).toBe(200);
    expect((await planOf(s)).billing.endedOn.toISOString()).toBe(key(today()));
  });

  test('an ordinary edit with the status unchanged leaves billing alone', async () => {
    const s = await learner('WD-6');
    expect((await patch(s, { status: 'active', firstName: 'Renamed' })).status).toBe(200);
    const plan = await planOf(s);
    expect(plan.billing.endedOn).toBeUndefined();
    expect(plan.billing.pauses).toHaveLength(0);
  });

  test('a learner without a plan withdraws as before', async () => {
    const s = await learner('WD-4', { plan: false });
    expect((await patch(s, { status: 'withdrawn' })).status).toBe(200);
  });
});

describe('no graduated status at a study center (R16)', () => {
  const patch = (id, body, who = 'owner', tenant = 'study') =>
    call('patch', `/academic/students/${id}`, who, body, tenant);

  test('a study-center learner cannot be marked graduated', async () => {
    const s = await learner('GR-1', { plan: false });
    const res = await patch(s._id, { status: 'graduated' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('A study center learner is either active or withdrawn');
  });

  test('a learner already graduated can still be brought back', async () => {
    const s = await Student.create({
      tenantId: tenants.study._id,
      admissionNo: 'GR-2',
      firstName: 'Old',
      lastName: 'Grad',
      status: 'graduated',
    });
    expect((await patch(s._id, { status: 'active' })).status).toBe(200);
  });

  test('a school can still graduate a student', async () => {
    const s = await Student.create({
      tenantId: tenants.school._id,
      admissionNo: 'SC-1',
      firstName: 'School',
      lastName: 'Kid',
    });
    expect((await patch(s._id, { status: 'graduated' }, 'schoolAdmin', 'school')).status).toBe(200);
  });
});
