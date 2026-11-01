// Check-in and check-out, live seat occupancy, open hours, the daily attendance
// record and the auto-close sweeper, through a mini Express app against an in-memory
// Mongo. Redis and BullMQ are faked. Time is fixed with fake timers that fake only
// Date, so the centre's clock (Asia/Kolkata) is deterministic.
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
const { Student } = await import('../models/Student.js');
const { Class } = await import('../models/Class.js');
const { Section } = await import('../models/Section.js');
const { Seat } = await import('../models/Seat.js');
const { SeatAllocation } = await import('../models/SeatAllocation.js');
const { Visit } = await import('../models/Visit.js');
const { AttendanceRecord } = await import('../models/AttendanceRecord.js');
const { FeeAssignment } = await import('../models/FeeAssignment.js');
const { TenantMembership } = await import('../models/TenantMembership.js');
const { default: visitsRouter } = await import('../routes/visits.js');
const { autoCloseVisits } = await import('../services/visit.service.js');
const { signAccessToken, hashPassword } = await import('../services/auth.service.js');
const { errorHandler } = await import('../middleware/errorHandler.js');

// Fake Date only: everything else (timers, nextTick, setImmediate) stays real so
// the database driver and supertest keep working.
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
const NOON_IST = new Date('2026-05-11T06:30:00Z'); // 12:00 IST, inside 06:00-22:00
const NIGHT_IST = new Date('2026-05-11T20:00:00Z'); // 01:30 IST on the 12th, closed
const clock = (date) => jest.useFakeTimers({ now: date, doNotFake: DO_NOT_FAKE });

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
    email: `${label}${n}@visit.test`,
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

const setCentre = (tenant, centre) =>
  Tenant.updateOne({ _id: tenant._id }, { $set: { 'settings.centre': centre } });

const plan = (studentId, status, from, to) =>
  FeeAssignment.create({
    tenantId: tenants.study._id,
    studentId,
    feeStructureId: new mongoose.Types.ObjectId(),
    academicYearId: new mongoose.Types.ObjectId(),
    totalAmount: 100,
    status,
    coversFrom: new Date(from),
    coversTo: new Date(to),
  });

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  await Promise.all([
    Visit.syncIndexes(),
    SeatAllocation.syncIndexes(),
    AttendanceRecord.syncIndexes(),
    Student.syncIndexes(),
  ]);

  const study = await makeTenant('visit-study', 'study_center');
  const study2 = await makeTenant('visit-study2', 'study_center');
  const tuition = await makeTenant('visit-tuition', 'tuition_center');
  tenants.study = study.tenant;
  tenants.study2 = study2.tenant;
  tenants.tuition = tuition.tenant;

  const owner = await makeMember(study.tenant, study.roles.tenant_admin, 'owner');
  const desk = await makeMember(study.tenant, study.roles.front_desk, 'desk');
  tokens.owner = owner.token;
  tokens.desk = desk.token;
  tokens.accountant = (await makeMember(study.tenant, study.roles.accountant, 'acct')).token;
  tokens.owner2 = (await makeMember(study2.tenant, study2.roles.tenant_admin, 'owner2')).token;
  tokens.tuitionOwner = (
    await makeMember(tuition.tenant, tuition.roles.tenant_admin, 'tuiown')
  ).token;
  ctx.deskUser = desk.user;

  const klass = await Class.create({ tenantId: study.tenant._id, name: 'Batches' });
  ctx.morning = await Section.create({
    tenantId: study.tenant._id,
    classId: klass._id,
    name: 'Morning',
    startTime: '06:00',
    endTime: '14:00',
  });

  ctx.seats = {};
  for (const label of ['A-1', 'A-2', 'A-3', 'A-4']) {
    ctx.seats[label] = await Seat.create({ tenantId: study.tenant._id, label });
  }
  ctx.m1 = await mkStudent(study.tenant, 'S-1', 'Asha'); // holds A-1 in the Morning
  ctx.m2 = await mkStudent(study.tenant, 'S-2', 'Ravi'); // no seat of their own
  ctx.walkIn = await mkStudent(study.tenant, 'W-1', 'Visitor', {
    kind: 'walk_in',
    phone: '9876543210',
  });
  ctx.walkIn2 = await mkStudent(study.tenant, 'W-2', 'Second', {
    kind: 'walk_in',
    phone: '9876543211',
  });
  ctx.other = await mkStudent(study2.tenant, 'O-1', 'Outsider');
  await SeatAllocation.create({
    tenantId: study.tenant._id,
    seatId: ctx.seats['A-1']._id,
    studentId: ctx.m1._id,
    sectionId: ctx.morning._id,
  });

  // Plans around the fixed "now": m1 valid, m2 expired, the walk-in has none.
  await plan(ctx.m1._id, 'paid', '2026-05-01T00:00:00Z', '2026-05-31T00:00:00Z');
  await plan(ctx.m2._id, 'paid', '2026-03-01T00:00:00Z', '2026-03-31T00:00:00Z');

  app = express();
  app.use(express.json());
  app.use(async (req, _res, next) => {
    req.tenant = await Tenant.findById(tenants[req.headers['x-tenant'] ?? 'study']._id).lean();
    next();
  });
  app.use('/academic', visitsRouter);
  app.use(errorHandler);
});

afterAll(async () => {
  jest.useRealTimers();
  await mongoose.disconnect();
  await mongod.stop();
});

beforeEach(() => clock(NOON_IST));
afterEach(() => jest.useRealTimers());

const call = (method, path, who, body, tenant = 'study') => {
  const req = request(app)[method](path).set('x-tenant', tenant);
  if (who) req.set('Authorization', `Bearer ${tokens[who]}`);
  return body === undefined ? req : req.send(body);
};

const checkIn = (who, student, seat, tenant) =>
  call(
    'post',
    '/academic/visits/check-in',
    who,
    { studentId: String(student._id), ...(seat ? { seatId: String(seat._id) } : {}) },
    tenant
  );

async function reset() {
  await Visit.deleteMany({ tenantId: tenants.study._id });
  await AttendanceRecord.deleteMany({ tenantId: tenants.study._id });
  await setCentre(tenants.study, {});
}

describe('check-in', () => {
  beforeEach(reset);

  test('a member with a valid plan is seated at their own chair and marked present for the day', async () => {
    const res = await checkIn('desk', ctx.m1);
    expect(res.status).toBe(201);
    expect(res.body.seat.label).toBe('A-1');
    expect(res.body.warning).toBeNull();
    expect(res.body.visit).toMatchObject({ entitlementAtCheckIn: 'valid', outsideHours: false });

    const record = await AttendanceRecord.findOne({
      tenantId: tenants.study._id,
      entityId: ctx.m1._id,
    }).lean();
    expect(record).toMatchObject({ status: 'present', entityType: 'student' });
    expect(record.date.toISOString()).toBe('2026-05-11T00:00:00.000Z');
    expect(String(record.sectionId)).toBe(String(ctx.morning._id));
    expect(record.subjectId).toBeNull();
    expect(auditLog).toHaveBeenCalledWith(expect.objectContaining({ action: 'visit.checkIn' }));
  });

  test('the attendance day is the centre’s, not the UTC day: 01:30 IST on the 12th is the 12th', async () => {
    clock(NIGHT_IST);
    await setCentre(tenants.study, { open24h: true });
    await checkIn('desk', ctx.m1);
    const record = await AttendanceRecord.findOne({
      tenantId: tenants.study._id,
      entityId: ctx.m1._id,
    }).lean();
    expect(record.date.toISOString()).toBe('2026-05-12T00:00:00.000Z');
  });

  test('the same learner cannot be checked in twice, but can after checking out, with one record for the day', async () => {
    const first = await checkIn('desk', ctx.m1);
    expect((await checkIn('desk', ctx.m1)).status).toBe(409);

    const out = await call('post', `/academic/visits/${first.body.visit._id}/check-out`, 'desk');
    expect(out.status).toBe(200);
    expect(out.body.outAt).toBeTruthy();
    expect(out.body.isOpen).toBeUndefined();

    expect((await checkIn('desk', ctx.m1)).status).toBe(201);
    expect(
      await AttendanceRecord.countDocuments({ tenantId: tenants.study._id, entityId: ctx.m1._id })
    ).toBe(1);
    expect(await Visit.countDocuments({ tenantId: tenants.study._id, studentId: ctx.m1._id })).toBe(
      2
    );
  });

  test('an expired plan warns and does not block (AC7)', async () => {
    const res = await checkIn('desk', ctx.m2);
    expect(res.status).toBe(201);
    expect(res.body.warning.status).toBe('expired');
    expect(res.body.visit.entitlementAtCheckIn).toBe('expired');
  });

  test('an unpaid plan warns, and so does never having had one', async () => {
    const unpaid = await mkStudent(tenants.study, 'S-UNPAID', 'Unpaid');
    await plan(unpaid._id, 'unpaid', '2026-05-01T00:00:00Z', '2026-05-31T00:00:00Z');
    expect((await checkIn('desk', unpaid)).body.warning.status).toBe('unpaid');
    expect((await checkIn('desk', ctx.walkIn)).body.warning.status).toBe('none');
  });

  test('a member may check in outside their shift at no extra cost, taking any free seat if theirs is busy (R30)', async () => {
    // Asha’s shift is the Morning; it is noon-ish, and Ravi is on her chair.
    await Visit.create({
      tenantId: tenants.study._id,
      studentId: ctx.m2._id,
      seatId: ctx.seats['A-1']._id,
      inAt: new Date(),
      isOpen: true,
      recordedBy: ctx.deskUser._id,
    });
    const res = await checkIn('desk', ctx.m1);
    expect(res.status).toBe(201);
    expect(res.body.seat.label).not.toBe('A-1');
    expect(res.body.warning).toBeNull();
  });

  test('a walk-in is only offered, and may only take, a seat no member holds (AC4)', async () => {
    const offered = await call(
      'get',
      `/academic/visits/free-seats?studentId=${ctx.walkIn._id}`,
      'desk'
    );
    expect(offered.body.map((s) => s.label)).toEqual(['A-2', 'A-3', 'A-4']);

    const held = await checkIn('desk', ctx.walkIn, ctx.seats['A-1']);
    expect(held.status).toBe(422);
    expect(held.body.error).toMatch(/no member holds/);

    const auto = await checkIn('desk', ctx.walkIn);
    expect(auto.status).toBe(201);
    expect(auto.body.seat.label).toBe('A-2');
  });

  test('a member sees their own chair first in the free-seat list', async () => {
    const res = await call('get', `/academic/visits/free-seats?studentId=${ctx.m1._id}`, 'desk');
    expect(res.body[0]).toMatchObject({ label: 'A-1', own: true });
  });

  test('two desks taking one seat at the same moment: one wins and the other is told who has it (EH1)', async () => {
    const results = await Promise.all([
      checkIn('desk', ctx.walkIn, ctx.seats['A-3']),
      checkIn('desk', ctx.walkIn2, ctx.seats['A-3']),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    const loser = results.find((r) => r.status === 409);
    expect(loser.body.error).toMatch(/Seat A-3 is taken by (Visitor|Second) Study/);
  });

  test('a busy seat is a 409, an out-of-use seat a 422, an unknown seat a 404', async () => {
    await checkIn('desk', ctx.walkIn, ctx.seats['A-3']);
    expect((await checkIn('desk', ctx.walkIn2, ctx.seats['A-3'])).status).toBe(409);

    await Seat.updateOne(
      { _id: ctx.seats['A-4']._id, tenantId: tenants.study._id },
      { isActive: false }
    );
    expect((await checkIn('desk', ctx.walkIn2, ctx.seats['A-4'])).status).toBe(422);
    await Seat.updateOne(
      { _id: ctx.seats['A-4']._id, tenantId: tenants.study._id },
      { isActive: true }
    );

    expect(
      (await checkIn('desk', ctx.walkIn2, { _id: new mongoose.Types.ObjectId() })).status
    ).toBe(404);
  });

  test('no free seat is a clear 409', async () => {
    await Seat.updateMany({ tenantId: tenants.study._id }, { isActive: false });
    const res = await checkIn('desk', ctx.walkIn);
    await Seat.updateMany({ tenantId: tenants.study._id }, { isActive: true });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/No free seat/);
  });

  test('an unknown learner is a 404; ids must be well formed', async () => {
    expect((await checkIn('desk', { _id: new mongoose.Types.ObjectId() })).status).toBe(404);
    expect(
      (await call('post', '/academic/visits/check-in', 'desk', { studentId: 'nope' })).status
    ).toBe(400);
  });
});

describe('opening hours', () => {
  beforeEach(reset);

  test('the front desk cannot check anyone in after closing; the owner can, and it is flagged and audited (AC8)', async () => {
    clock(NIGHT_IST);
    const denied = await checkIn('desk', ctx.m1);
    expect(denied.status).toBe(403);
    expect(denied.body.error).toMatch(/owner must check learners in/);
    expect(await Visit.countDocuments({ tenantId: tenants.study._id })).toBe(0);

    const ok = await checkIn('owner', ctx.m1);
    expect(ok.status).toBe(201);
    expect(ok.body.visit.outsideHours).toBe(true);
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'visit.outsideHours' })
    );
  });

  test('the owner’s hours are the ones in the settings: widening them lets the desk in', async () => {
    clock(NIGHT_IST);
    await setCentre(tenants.study, { openTime: '00:00', closeTime: '23:59' });
    expect((await checkIn('desk', ctx.m1)).status).toBe(201);
  });

  test('a 24-hour centre lets the desk in at any hour', async () => {
    clock(NIGHT_IST);
    await setCentre(tenants.study, { open24h: true });
    expect((await checkIn('desk', ctx.m1)).status).toBe(201);
  });

  test('check-out is never refused for being outside hours', async () => {
    const inn = await checkIn('desk', ctx.m1);
    clock(NIGHT_IST);
    expect(
      (await call('post', `/academic/visits/${inn.body.visit._id}/check-out`, 'desk')).status
    ).toBe(200);
  });
});

describe('who is in, and who may', () => {
  beforeEach(reset);

  test('the open list shows names and seats, and shrinks on check-out', async () => {
    const a = await checkIn('desk', ctx.m1);
    await checkIn('desk', ctx.walkIn);
    const open = await call('get', '/academic/visits/open', 'desk');
    expect(open.body.map((v) => [v.student.name, v.student.kind, v.seat.label])).toEqual([
      ['Asha Study', 'member', 'A-1'],
      ['Visitor Study', 'walk_in', 'A-2'],
    ]);

    await call('post', `/academic/visits/${a.body.visit._id}/check-out`, 'desk');
    expect((await call('get', '/academic/visits/open', 'desk')).body).toHaveLength(1);
  });

  test('check-out of a closed or unknown visit is a 404, and another centre’s visit is invisible', async () => {
    const inn = await checkIn('desk', ctx.m1);
    expect(
      (
        await call(
          'post',
          `/academic/visits/${inn.body.visit._id}/check-out`,
          'owner2',
          undefined,
          'study2'
        )
      ).status
    ).toBe(404);
    await call('post', `/academic/visits/${inn.body.visit._id}/check-out`, 'desk');
    expect(
      (await call('post', `/academic/visits/${inn.body.visit._id}/check-out`, 'desk')).status
    ).toBe(404);
    expect(
      (await call('get', '/academic/visits/open', 'owner2', undefined, 'study2')).body
    ).toEqual([]);
  });

  test('another centre’s learner cannot be checked in here', async () => {
    expect((await checkIn('desk', ctx.other)).status).toBe(404);
  });

  test('needs attendance:write to check in and attendance:read to look', async () => {
    expect((await checkIn('accountant', ctx.m1)).status).toBe(403);
    expect((await call('get', '/academic/visits/open', 'accountant')).status).toBe(403);
  });

  test('is not available to a tuition center', async () => {
    expect(
      (await call('get', '/academic/visits/open', 'tuitionOwner', undefined, 'tuition')).status
    ).toBe(403);
    expect(
      (
        await call(
          'post',
          '/academic/visits/check-in',
          'tuitionOwner',
          { studentId: String(ctx.m1._id) },
          'tuition'
        )
      ).status
    ).toBe(403);
  });

  test('a manual absent mark the same day is overwritten by the check-in, not duplicated', async () => {
    await AttendanceRecord.create({
      tenantId: tenants.study._id,
      date: new Date('2026-05-11T00:00:00Z'),
      entityType: 'student',
      entityId: ctx.m1._id,
      status: 'absent',
      markedBy: ctx.deskUser._id,
    });
    await checkIn('desk', ctx.m1);
    const records = await AttendanceRecord.find({
      tenantId: tenants.study._id,
      entityId: ctx.m1._id,
    }).lean();
    expect(records).toHaveLength(1);
    expect(records[0].status).toBe('present');
  });
});

describe('the auto-close sweeper', () => {
  beforeEach(reset);

  test('closes visits left open past closing time, flags them, and runs once (AC9, EH5)', async () => {
    await checkIn('desk', ctx.m1);
    await checkIn('desk', ctx.walkIn);

    // Before closing: nothing to do.
    expect(await autoCloseVisits(new Date('2026-05-11T16:00:00Z'))).toBe(0);

    // After 22:00 IST (16:30Z) both are closed at the closing time.
    expect(await autoCloseVisits(new Date('2026-05-11T16:40:00Z'))).toBe(2);
    const visits = await Visit.find({ tenantId: tenants.study._id }).lean();
    for (const v of visits) {
      expect(v.autoClosed).toBe(true);
      expect(v.isOpen).toBeUndefined();
      expect(v.outAt.toISOString()).toBe('2026-05-11T16:30:00.000Z');
    }
    // A second run finds nothing, and the seat can be used again.
    expect(await autoCloseVisits(new Date('2026-05-11T17:00:00Z'))).toBe(0);
    expect((await checkIn('desk', ctx.walkIn)).status).toBe(201);
  });

  test('a 24-hour centre closes only after 16 hours, and only its own visits', async () => {
    await setCentre(tenants.study, { open24h: true });
    await checkIn('desk', ctx.m1);
    expect(await autoCloseVisits(new Date('2026-05-11T20:00:00Z'))).toBe(0);
    expect(await autoCloseVisits(new Date('2026-05-11T22:31:00Z'))).toBe(1);
    const v = await Visit.findOne({ tenantId: tenants.study._id }).lean();
    // Checked in 06:30Z, so the 16-hour cap is 22:30Z.
    expect(v.outAt.toISOString()).toBe('2026-05-11T22:30:00.000Z');
  });

  test('does nothing, and does not fail, when no visit is open', async () => {
    expect(await autoCloseVisits(new Date('2030-01-01'))).toBe(0);
  });
});
