// The front-desk payload and the owner's check-out-everyone, through a mini Express app
// against an in-memory Mongo (same harness as visitRoutes.test.js).
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

const get = (path, who, tenant) => call('get', path, who, undefined, tenant);

describe('the desk payload', () => {
  beforeEach(reset);

  test('lists active members by name with plan status, and the strip counts what is inside', async () => {
    await checkIn('desk', ctx.m1);
    const res = await get('/academic/visits/desk', 'desk');
    expect(res.status).toBe(200);
    const names = res.body.learners.map((l) => l.name);
    expect(names).toEqual(['Asha Study', 'Ravi Study']); // walk-ins are not on the roster
    const asha = res.body.learners.find((l) => l.name === 'Asha Study');
    expect(asha.inside).toMatchObject({ seatLabel: 'A-1' });
    expect(asha.ownSeat).toMatchObject({ label: 'A-1' });
    expect(asha.entitlement.status).toBe('valid');
    expect(res.body.learners.find((l) => l.name === 'Ravi Study').entitlement.status).toBe(
      'expired'
    );
    expect(res.body.summary).toMatchObject({
      insideNow: 1,
      seatsActive: 4,
      freeSeats: 3,
      checkInsToday: 1,
      openNow: true,
    });
  });

  test('a walk-in shows while inside, or when searched for, and not otherwise', async () => {
    const roster = await get('/academic/visits/desk', 'desk');
    expect(roster.body.learners.map((l) => l.name)).not.toContain('Visitor Study');
    const found = await get('/academic/visits/desk?search=9876543210', 'desk');
    expect(found.body.learners.map((l) => l.name)).toEqual(['Visitor Study']);

    await checkIn('desk', ctx.walkIn, ctx.seats['A-2']);
    const inside = await get('/academic/visits/desk', 'desk');
    expect(inside.body.learners.find((l) => l.name === 'Visitor Study').inside).toBeTruthy();
  });

  test('search matches every word; filters split inside from not inside', async () => {
    await checkIn('desk', ctx.m1);
    const search = await get('/academic/visits/desk?search=asha%20study', 'desk');
    expect(search.body.learners.map((l) => l.name)).toEqual(['Asha Study']);
    const inside = await get('/academic/visits/desk?filter=inside', 'desk');
    expect(inside.body.learners.map((l) => l.name)).toEqual(['Asha Study']);
    const out = await get('/academic/visits/desk?filter=notInside', 'desk');
    expect(out.body.learners.map((l) => l.name)).toEqual(['Ravi Study']);
    const warn = await get('/academic/visits/desk?filter=warning', 'desk');
    expect(warn.body.learners.map((l) => l.name)).toEqual(['Ravi Study']);
    expect((await get('/academic/visits/desk?filter=bogus', 'desk')).status).toBe(400);
  });

  test('seat tiles show who is on a seat and who holds the others', async () => {
    await checkIn('desk', ctx.m2, ctx.seats['A-1']); // Ravi takes the seat Asha holds
    const { seats } = (await get('/academic/visits/desk', 'desk')).body;
    expect(seats.map((s) => s.label)).toEqual(['A-1', 'A-2', 'A-3', 'A-4']);
    expect(seats[0]).toMatchObject({
      state: 'occupied',
      occupant: { name: 'Ravi Study' },
      holder: { name: 'Asha Study' },
    });
    expect(seats[1]).toMatchObject({ state: 'free', pool: true });
  });

  test('today activity lists check-ins and check-outs, newest first', async () => {
    const first = await checkIn('desk', ctx.m1);
    clock(new Date(NOON_IST.getTime() + 30 * 60_000));
    await call('post', `/academic/visits/${first.body.visit._id}/check-out`, 'desk');
    clock(new Date(NOON_IST.getTime() + 60 * 60_000));
    await checkIn('desk', ctx.m2, ctx.seats['A-3']);
    const { activity } = (await get('/academic/visits/desk', 'desk')).body;
    expect(activity.map((a) => [a.name, a.seatLabel, a.outAt === null])).toEqual([
      ['Ravi Study', 'A-3', true],
      ['Asha Study', 'A-1', false],
    ]);
  });

  test('plan status needs fees:read; the strip does not', async () => {
    const res = await get('/academic/visits/desk', 'owner');
    expect(res.body.learners[0].entitlement).toBeDefined();
    // A role with attendance:read but no fees:read gets the desk without plan status.
    const reader = await Role.create({
      tenantId: tenants.study._id,
      name: 'reader',
      templateKey: 'custom',
      permissions: ['attendance:read'],
    });
    tokens.reader = (await makeMember(tenants.study, reader, 'reader')).token;
    const noFees = await get('/academic/visits/desk', 'reader');
    expect(noFees.status).toBe(200);
    expect(noFees.body.learners[0].entitlement).toBeUndefined();
  });

  test('needs attendance:read, is study-center only, and never shows another centre data', async () => {
    expect((await get('/academic/visits/desk', 'accountant')).status).toBe(403);
    expect((await get('/academic/visits/desk', 'tuitionOwner', 'tuition')).status).toBe(403);
    const other = await get('/academic/visits/desk', 'owner2', 'study2');
    expect(other.body.learners.map((l) => l.name)).toEqual(['Outsider Study']);
    expect(other.body.seats).toEqual([]);
  });
});

describe('check out everyone', () => {
  beforeEach(async () => {
    await reset();
    auditLog.mockClear();
  });

  test('an owner closes every open visit, flagged bulkClosed and audited one by one', async () => {
    await checkIn('desk', ctx.m1);
    await checkIn('desk', ctx.m2, ctx.seats['A-3']);
    await checkIn('desk', ctx.walkIn, ctx.seats['A-2']);
    auditLog.mockClear();

    const res = await call('post', '/academic/visits/check-out-all', 'owner');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ closed: 3 });

    const visits = await Visit.find({ tenantId: tenants.study._id }).lean();
    expect(visits).toHaveLength(3);
    for (const v of visits) {
      expect(v.outAt).toBeTruthy();
      expect(v.isOpen).toBeUndefined();
      expect(v.bulkClosed).toBe(true);
      expect(v.autoClosed).toBe(false);
    }
    const audits = auditLog.mock.calls.filter(([a]) => a.action === 'visit.checkOut');
    expect(audits).toHaveLength(3);
    expect((await get('/academic/visits/open', 'owner')).body).toEqual([]);
  });

  test('the front desk is refused, and nothing is closed', async () => {
    await checkIn('desk', ctx.m1);
    const res = await call('post', '/academic/visits/check-out-all', 'desk');
    expect(res.status).toBe(403);
    expect(await Visit.countDocuments({ tenantId: tenants.study._id, isOpen: true })).toBe(1);
  });

  test('with nobody inside it closes nothing and audits nothing (EH3)', async () => {
    const res = await call('post', '/academic/visits/check-out-all', 'owner');
    expect(res.body).toEqual({ closed: 0 });
    expect(auditLog).not.toHaveBeenCalled();
  });

  test('only this centre visits are closed; a tuition center cannot use it', async () => {
    await checkIn('desk', ctx.m1);
    const other = await call(
      'post',
      '/academic/visits/check-out-all',
      'owner2',
      undefined,
      'study2'
    );
    expect(other.body).toEqual({ closed: 0 });
    expect(await Visit.countDocuments({ tenantId: tenants.study._id, isOpen: true })).toBe(1);
    const tuition = await call(
      'post',
      '/academic/visits/check-out-all',
      'tuitionOwner',
      undefined,
      'tuition'
    );
    expect(tuition.status).toBe(403);
  });

  test('a learner can be checked in again afterwards, and the visit keeps its real minutes', async () => {
    await checkIn('desk', ctx.m1);
    clock(new Date(NOON_IST.getTime() + 90 * 60_000));
    await call('post', '/academic/visits/check-out-all', 'owner');
    const history = await get(`/academic/students/${ctx.m1._id}/visits`, 'owner');
    expect(history.body.visits[0]).toMatchObject({
      minutes: 90,
      bulkClosed: true,
      autoClosed: false,
    });
    expect((await checkIn('desk', ctx.m1)).status).toBe(201);
  });
});
