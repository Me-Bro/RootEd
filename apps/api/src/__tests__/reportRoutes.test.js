// The four owner reads (hours per learner, occupancy, no-shows, day-pass sales),
// through a mini Express app against an in-memory Mongo. Redis, BullMQ and storage
// are faked, and Date is fixed with fake timers so the centre's clock is stable.
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
const { Class } = await import('../models/Class.js');
const { Section } = await import('../models/Section.js');
const { Seat } = await import('../models/Seat.js');
const { SeatAllocation } = await import('../models/SeatAllocation.js');
const { Visit } = await import('../models/Visit.js');
const { FeeStructure } = await import('../models/FeeStructure.js');
const { FeeAssignment } = await import('../models/FeeAssignment.js');
const { FeePayment } = await import('../models/FeePayment.js');
const { TenantMembership } = await import('../models/TenantMembership.js');
const { default: visitsRouter } = await import('../routes/visits.js');
const { default: feeRouter } = await import('../routes/fee.js');
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
const NOW = new Date('2026-05-20T10:00:00Z'); // 15:30 IST on 20 May 2026

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
    email: `${label}${n}@report.test`,
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

const mkStudent = (tenant, admissionNo, firstName, extra = {}) =>
  Student.create({ tenantId: tenant._id, admissionNo, firstName, lastName: 'Study', ...extra });

const visit = (student, seat, inAt, outAt, extra = {}) =>
  Visit.create({
    tenantId: tenants.study._id,
    studentId: student._id,
    seatId: seat._id,
    inAt: new Date(inAt),
    ...(outAt ? { outAt: new Date(outAt) } : { isOpen: true }),
    recordedBy: ctx.recorder._id,
    ...extra,
  });

const assignment = (student, status, from, to, extra = {}) =>
  FeeAssignment.create({
    tenantId: tenants.study._id,
    studentId: student._id,
    feeStructureId: ctx.monthly._id,
    academicYearId: ctx.monthly.academicYearId,
    totalAmount: 1200,
    status,
    coversFrom: new Date(from),
    coversTo: new Date(to),
    ...extra,
  });

let receipt = 0;
const payment = (assignmentDoc, student, amount, paymentDate, extra = {}) => {
  receipt += 1;
  return FeePayment.create({
    tenantId: tenants.study._id,
    assignmentId: assignmentDoc._id,
    studentId: student._id,
    amount,
    paymentMethod: 'cash',
    receiptNumber: `RCP-T-${receipt}`,
    paymentDate: new Date(paymentDate),
    collectedBy: ctx.recorder._id,
    ...extra,
  });
};

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  await Promise.all([Visit.syncIndexes(), SeatAllocation.syncIndexes(), FeePayment.syncIndexes()]);

  const study = await makeTenant('report-study', 'study_center');
  const study2 = await makeTenant('report-study2', 'study_center');
  const tuition = await makeTenant('report-tuition', 'tuition_center');
  tenants.study = study.tenant;
  tenants.study2 = study2.tenant;
  tenants.tuition = tuition.tenant;

  const owner = await makeMember(study.tenant, study.roles.tenant_admin, 'owner');
  tokens.owner = owner.token;
  ctx.recorder = owner.user;
  tokens.desk = (await makeMember(study.tenant, study.roles.front_desk, 'desk')).token;
  tokens.teacher = (await makeMember(study.tenant, study.roles.teacher, 'teacher')).token;
  tokens.learner = (await makeMember(study.tenant, study.roles.student, 'learner')).token;
  tokens.owner2 = (await makeMember(study2.tenant, study2.roles.tenant_admin, 'owner2')).token;
  tokens.tuitionOwner = (
    await makeMember(tuition.tenant, tuition.roles.tenant_admin, 'tuiown')
  ).token;

  const klass = await Class.create({ tenantId: study.tenant._id, name: 'Batches' });
  ctx.morning = await Section.create({
    tenantId: study.tenant._id,
    classId: klass._id,
    name: 'Morning',
    startTime: '06:00',
    endTime: '14:00',
  });
  ctx.evening = await Section.create({
    tenantId: study.tenant._id,
    classId: klass._id,
    name: 'Evening',
    startTime: '14:00',
    endTime: '22:00',
  });
  ctx.seats = {};
  for (const [label, isActive] of [
    ['A-1', true],
    ['A-2', true],
    ['A-3', true],
    ['A-4', false],
  ]) {
    ctx.seats[label] = await Seat.create({ tenantId: study.tenant._id, label, isActive });
  }

  ctx.m1 = await mkStudent(study.tenant, 'S-1', 'Asha');
  ctx.m2 = await mkStudent(study.tenant, 'S-2', 'Ravi');
  ctx.m3 = await mkStudent(study.tenant, 'S-3', 'Meena');
  ctx.m4 = await mkStudent(study.tenant, 'S-4', 'Zed');
  ctx.walkIn = await mkStudent(study.tenant, 'W-1', 'Visitor', {
    kind: 'walk_in',
    phone: '9876543210',
  });
  ctx.outsider = await mkStudent(study2.tenant, 'O-1', 'Outsider');

  await SeatAllocation.create({
    tenantId: study.tenant._id,
    seatId: ctx.seats['A-1']._id,
    studentId: ctx.m1._id,
    sectionId: ctx.morning._id,
  });
  await SeatAllocation.create({
    tenantId: study.tenant._id,
    seatId: ctx.seats['A-2']._id,
    studentId: ctx.m2._id,
    sectionId: ctx.evening._id,
  });

  // Fee structures: a monthly plan and a day pass.
  const year = new mongoose.Types.ObjectId();
  ctx.monthly = await FeeStructure.create({
    tenantId: study.tenant._id,
    name: 'Monthly',
    academicYearId: year,
    components: [{ label: 'Monthly', amount: 1200 }],
    plan: { kind: 'shift_plan', durationDays: 30 },
  });
  ctx.dayPass = await FeeStructure.create({
    tenantId: study.tenant._id,
    name: 'Day pass',
    academicYearId: year,
    components: [{ label: 'Day pass', amount: 150 }],
    plan: { kind: 'day_pass', durationDays: 1 },
  });

  app = express();
  app.use(express.json());
  app.use(async (req, _res, next) => {
    req.tenant = await Tenant.findById(tenants[req.headers['x-tenant'] ?? 'study']._id).lean();
    next();
  });
  app.use('/academic', visitsRouter);
  app.use('/fee', feeRouter);
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

describe('GET /academic/visits/reports/hours', () => {
  beforeAll(async () => {
    const a1 = ctx.seats['A-1'];
    await visit(ctx.m1, a1, '2026-05-11T04:00:00Z', '2026-05-11T06:00:00Z'); // 120
    await visit(ctx.m1, a1, '2026-05-12T04:00:00Z', '2026-05-12T05:30:00Z'); // 90
    await visit(ctx.m1, a1, '2026-05-13T04:00:00Z', '2026-05-13T05:00:00Z', { autoClosed: true }); // 60
    await visit(ctx.m1, a1, '2026-05-31T18:00:00Z', '2026-05-31T18:20:00Z'); // 23:30 IST 31 May: May, 20
    await visit(ctx.m1, a1, '2026-05-31T18:40:00Z', '2026-05-31T19:00:00Z'); // 00:10 IST 1 June: June
    await visit(ctx.m1, a1, '2026-04-20T04:00:00Z', '2026-04-20T05:00:00Z'); // April
    await visit(ctx.walkIn, ctx.seats['A-3'], '2026-05-14T04:00:00Z', '2026-05-14T09:00:00Z'); // 300
  });

  test('minutes per learner for the month, longest first, with the learner’s kind', async () => {
    const res = await get('/academic/visits/reports/hours?month=2026-05', 'owner');
    expect(res.status).toBe(200);
    expect(
      res.body.learners.map((l) => [l.name, l.kind, l.minutes, l.visits, l.autoClosedVisits])
    ).toEqual([
      ['Visitor Study', 'walk_in', 300, 1, 0],
      ['Asha Study', 'member', 290, 4, 1],
    ]);
    expect(res.body.totalMinutes).toBe(590);
  });

  test('a visit that began just after midnight on the 1st belongs to the new month, on the centre’s clock', async () => {
    const june = await get('/academic/visits/reports/hours?month=2026-06', 'owner');
    expect(june.body.learners).toHaveLength(1);
    expect(june.body.learners[0]).toMatchObject({ name: 'Asha Study', minutes: 20, visits: 1 });
  });

  test('a visit still open counts up to now', async () => {
    const open = await visit(ctx.m2, ctx.seats['A-2'], '2026-05-20T08:00:00Z'); // now is 10:00Z
    const res = await get('/academic/visits/reports/hours?month=2026-05', 'owner');
    expect(res.body.learners.find((l) => l.name === 'Ravi Study').minutes).toBe(120);
    await Visit.deleteOne({ _id: open._id, tenantId: tenants.study._id });
  });

  test('rejects a bad month, and needs attendance:read', async () => {
    expect((await get('/academic/visits/reports/hours?month=2026-13', 'owner')).status).toBe(400);
    expect((await get('/academic/visits/reports/hours', 'owner')).status).toBe(400);
    expect((await get('/academic/visits/reports/hours?month=2026-05', 'learner')).status).toBe(403);
  });

  test('another centre sees none of it, and a tuition center is refused', async () => {
    const other = await get('/academic/visits/reports/hours?month=2026-05', 'owner2', 'study2');
    expect(other.body).toEqual({ month: '2026-05', learners: [], totalMinutes: 0 });
    expect(
      (await get('/academic/visits/reports/hours?month=2026-05', 'tuitionOwner', 'tuition')).status
    ).toBe(403);
  });
});

describe('GET /academic/visits/reports/occupancy', () => {
  test('seats held, seats occupied now, and the day-pass pool', async () => {
    const inside = [
      await visit(ctx.m2, ctx.seats['A-2'], '2026-05-20T08:00:00Z'),
      await visit(ctx.walkIn, ctx.seats['A-3'], '2026-05-20T08:30:00Z'),
    ];
    const res = await get('/academic/visits/reports/occupancy', 'desk');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      seatsActive: 3, // A-4 is out of use
      held: 2,
      occupiedNow: 2,
      poolSeats: 1, // A-3
      poolFree: 0, // the walk-in is on it
    });
    expect(res.body.shifts.map((s) => [s.name, s.heldSeats, s.checkedInNow])).toEqual([
      ['Morning', 1, 0],
      ['Evening', 1, 1],
    ]);

    // Once the walk-in leaves, the pool seat is free again.
    await Visit.updateOne(
      { _id: inside[1]._id, tenantId: tenants.study._id },
      { $set: { outAt: NOW }, $unset: { isOpen: '' } }
    );
    const after = await get('/academic/visits/reports/occupancy', 'desk');
    expect(after.body).toMatchObject({ occupiedNow: 1, poolFree: 1 });
    await Visit.deleteMany({ _id: inside[0]._id, tenantId: tenants.study._id });
  });

  test('another centre sees an empty one; a learner and a tuition center are refused', async () => {
    const other = await get('/academic/visits/reports/occupancy', 'owner2', 'study2');
    expect(other.body).toMatchObject({ seatsActive: 0, held: 0, occupiedNow: 0 });
    expect((await get('/academic/visits/reports/occupancy', 'learner')).status).toBe(403);
    expect(
      (await get('/academic/visits/reports/occupancy', 'tuitionOwner', 'tuition')).status
    ).toBe(403);
  });
});

describe('GET /academic/visits/reports/no-shows', () => {
  beforeAll(async () => {
    const may = ['2026-05-01T00:00:00Z', '2026-05-31T00:00:00Z'];
    await assignment(ctx.m1, 'paid', ...may);
    await assignment(ctx.m2, 'unpaid', ...may); // not paid: not expected
    await assignment(ctx.m3, 'paid', ...may);
    await assignment(ctx.m4, 'waived', ...may);
    await assignment(ctx.walkIn, 'paid', ...may); // a walk-in is never a no-show
    await visit(ctx.m3, ctx.seats['A-3'], '2026-05-15T05:00:00Z', '2026-05-15T06:00:00Z');
  });

  test('members with a paid plan covering the day who never came in, by name', async () => {
    const res = await get('/academic/visits/reports/no-shows?date=2026-05-15', 'owner');
    expect(res.status).toBe(200);
    expect(res.body.date).toBe('2026-05-15');
    expect(res.body.noShows.map((r) => r.name)).toEqual(['Asha Study', 'Zed Study']);
    expect(res.body.noShows[0].coversTo).toBe('2026-05-31T00:00:00.000Z');
  });

  test('a visit on that day takes someone off the list, a visit on another day does not', async () => {
    await visit(ctx.m1, ctx.seats['A-1'], '2026-05-15T04:00:00Z', '2026-05-15T05:00:00Z');
    const day = await get('/academic/visits/reports/no-shows?date=2026-05-15', 'owner');
    expect(day.body.noShows.map((r) => r.name)).toEqual(['Zed Study']);
    const other = await get('/academic/visits/reports/no-shows?date=2026-05-16', 'owner');
    expect(other.body.noShows.map((r) => r.name)).toEqual([
      'Asha Study',
      'Meena Study',
      'Zed Study',
    ]);
  });

  test('a day outside every plan has no no-shows; a bad date is rejected; another centre sees none', async () => {
    expect(
      (await get('/academic/visits/reports/no-shows?date=2026-07-01', 'owner')).body.noShows
    ).toEqual([]);
    expect((await get('/academic/visits/reports/no-shows?date=15-05-2026', 'owner')).status).toBe(
      400
    );
    expect(
      (await get('/academic/visits/reports/no-shows?date=2026-05-15', 'owner2', 'study2')).body
        .noShows
    ).toEqual([]);
    expect((await get('/academic/visits/reports/no-shows?date=2026-05-15', 'learner')).status).toBe(
      403
    );
  });
});

describe('GET /fee/reports/day-pass-sales', () => {
  beforeAll(async () => {
    const pass = (student) =>
      assignment(student, 'paid', '2026-05-17T00:00:00Z', '2026-05-20T00:00:00Z', {
        feeStructureId: ctx.dayPass._id,
        totalAmount: 150,
      });
    const a = await pass(ctx.walkIn);
    const b = await pass(ctx.m1);
    const c = await pass(ctx.m2);
    const refunded = await pass(ctx.m3);
    const monthly = await assignment(
      ctx.m4,
      'paid',
      '2026-05-01T00:00:00Z',
      '2026-05-31T00:00:00Z'
    );

    await payment(a, ctx.walkIn, 150, '2026-05-18T05:00:00Z');
    await payment(b, ctx.m1, 150, '2026-05-18T18:00:00Z'); // 23:30 IST on the 18th
    await payment(c, ctx.m2, 142, '2026-05-18T19:00:00Z'); // 00:30 IST on the 19th
    await payment(refunded, ctx.m3, 150, '2026-05-18T06:00:00Z', { refunded: true });
    await payment(monthly, ctx.m4, 1200, '2026-05-18T06:00:00Z'); // not a day pass
  });

  test('per day on the centre’s clock, refunds and other plans left out', async () => {
    const res = await get('/fee/reports/day-pass-sales?from=2026-05-17&to=2026-05-20', 'owner');
    expect(res.status).toBe(200);
    expect(res.body.days).toEqual([
      { day: '2026-05-18', count: 2, revenue: 300 },
      { day: '2026-05-19', count: 1, revenue: 142 },
    ]);
    expect(res.body).toMatchObject({
      from: '2026-05-17',
      to: '2026-05-20',
      totalCount: 3,
      totalRevenue: 442,
    });
  });

  test('the range is inclusive of both ends and defaults to the last 30 days', async () => {
    const only = await get('/fee/reports/day-pass-sales?from=2026-05-19&to=2026-05-19', 'owner');
    expect(only.body.days).toEqual([{ day: '2026-05-19', count: 1, revenue: 142 }]);

    const dflt = await get('/fee/reports/day-pass-sales', 'owner');
    expect(dflt.body.to).toBe('2026-05-20');
    expect(dflt.body.from).toBe('2026-04-21');
    expect(dflt.body.totalCount).toBe(3);
  });

  test('rejects a backwards range, needs fees:read, and is tenant-scoped', async () => {
    expect(
      (await get('/fee/reports/day-pass-sales?from=2026-05-20&to=2026-05-01', 'owner')).status
    ).toBe(400);
    expect((await get('/fee/reports/day-pass-sales', 'teacher')).status).toBe(403);
    expect((await get('/fee/reports/day-pass-sales', 'owner2', 'study2')).body.totalCount).toBe(0);
    expect((await get('/fee/reports/day-pass-sales', 'tuitionOwner', 'tuition')).status).toBe(403);
  });
});
