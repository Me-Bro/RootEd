// Seats, standing allocations, shift hours and the learner's /me/seat, driven
// through a mini Express app against an in-memory Mongo. Redis and BullMQ are
// faked (the permission cache only needs get/setex/del; the academic router builds
// a Queue at import time).
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
const { Enrollment } = await import('../models/Enrollment.js');
const { Seat } = await import('../models/Seat.js');
const { FeeStructure } = await import('../models/FeeStructure.js');
const { FeeAssignment } = await import('../models/FeeAssignment.js');
const { SeatAllocation } = await import('../models/SeatAllocation.js');
const { TenantMembership } = await import('../models/TenantMembership.js');
const { default: academicRouter } = await import('../routes/academic.js');
const { default: seatsRouter } = await import('../routes/seats.js');
const { default: meRouter } = await import('../routes/me.js');
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

async function makeUser(label) {
  n += 1;
  return User.create({
    email: `${label}${n}@seats.test`,
    username: `${label}-${n}`,
    usernameLower: `${label}-${n}`,
    passwordHash: await hashPassword('irrelevant-but-valid'),
    emailVerified: true,
    status: 'active',
  });
}

async function makeMember(tenant, role, label) {
  const user = await makeUser(label);
  await TenantMembership.create({
    tenantId: tenant._id,
    userId: user._id,
    roleIds: [role._id],
    status: 'active',
  });
  return { user, token: signAccessToken({ sub: user._id.toString() }) };
}

const enroll = (tenant, student, section) =>
  Enrollment.create({ tenantId: tenant._id, studentId: student._id, sectionId: section._id });

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  await Promise.all([
    Student.syncIndexes(),
    Seat.syncIndexes(),
    SeatAllocation.syncIndexes(),
    Enrollment.syncIndexes(),
  ]);

  const study = await makeTenant('seat-study', 'study_center');
  const study2 = await makeTenant('seat-study2', 'study_center');
  const tuition = await makeTenant('seat-tuition', 'tuition_center');
  tenants.study = study.tenant;
  tenants.study2 = study2.tenant;
  tenants.tuition = tuition.tenant;

  tokens.owner = (await makeMember(study.tenant, study.roles.tenant_admin, 'owner')).token;
  tokens.desk = (await makeMember(study.tenant, study.roles.front_desk, 'desk')).token;
  tokens.teacher = (await makeMember(study.tenant, study.roles.teacher, 'teacher')).token;
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
  ctx.klass = klass;

  // Two members with a login each, one without, one walk-in.
  const login1 = await makeMember(study.tenant, study.roles.student, 'learner1');
  const login2 = await makeMember(study.tenant, study.roles.student, 'learner2');
  tokens.learner1 = login1.token;
  tokens.learner2 = login2.token;
  const mk = (admissionNo, firstName, extra = {}) =>
    Student.create({
      tenantId: study.tenant._id,
      admissionNo,
      firstName,
      lastName: 'Study',
      ...extra,
    });
  ctx.m1 = await mk('S-1', 'Asha', { userId: login1.user._id });
  ctx.m2 = await mk('S-2', 'Ravi', { userId: login2.user._id });
  ctx.m3 = await mk('S-3', 'Meena');
  ctx.walkIn = await mk('W-1', 'Visitor', { kind: 'walk_in', phone: '9876543210' });
  await enroll(study.tenant, ctx.m1, ctx.morning);
  await enroll(study.tenant, ctx.m1, ctx.evening);
  await enroll(study.tenant, ctx.m2, ctx.morning);
  await enroll(study.tenant, ctx.m2, ctx.evening);
  await enroll(study.tenant, ctx.m3, ctx.morning);

  // A tuition-center student must stay unaffected by everything below.
  ctx.tuitionStudent = await Student.create({
    tenantId: tuition.tenant._id,
    admissionNo: 'T-1',
    firstName: 'Tina',
    lastName: 'Tuition',
  });

  app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.tenant = tenants[req.headers['x-tenant'] ?? 'study'];
    next();
  });
  app.use('/me', meRouter);
  app.use('/academic', academicRouter);
  app.use('/academic', seatsRouter);
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

const seatByLabel = async (label, tenant = 'study') =>
  Seat.findOne({ tenantId: tenants[tenant]._id, label }).lean();

describe('seats', () => {
  test('a run of seats is created, and adding it again skips what exists', async () => {
    const first = await call('post', '/academic/seats', 'owner', {
      prefix: 'A-',
      count: 6,
      zone: 'Hall 1',
    });
    expect(first.status).toBe(201);
    expect(first.body).toEqual({ created: 6, skipped: 0 });

    const again = await call('post', '/academic/seats', 'owner', { prefix: 'A-', count: 6 });
    expect(again.body).toEqual({ created: 0, skipped: 6 });

    await call('post', '/academic/seats', 'owner', { prefix: 'B-', count: 6, zone: 'Hall 2' });
    expect(await Seat.countDocuments({ tenantId: tenants.study._id })).toBe(12);
    expect(auditLog).toHaveBeenCalledWith(expect.objectContaining({ action: 'seat.createMany' }));
  });

  test('a single seat can be created, a duplicate label is a 409', async () => {
    const ok = await call('post', '/academic/seats', 'desk', { label: 'C-1', zone: 'Cabins' });
    expect(ok.status).toBe(201);
    expect(ok.body).toMatchObject({ label: 'C-1', zone: 'Cabins', isActive: true });
    expect((await call('post', '/academic/seats', 'desk', { label: 'C-1' })).status).toBe(409);
  });

  test('seats list in natural label order', async () => {
    await call('post', '/academic/seats', 'owner', { prefix: 'N-', count: 10 });
    const res = await call('get', '/academic/seats', 'teacher');
    const labels = res.body.map((s) => s.label).filter((l) => l.startsWith('N-'));
    expect(labels.slice(0, 3)).toEqual(['N-1', 'N-2', 'N-3']);
    expect(labels.slice(-2)).toEqual(['N-9', 'N-10']);
  });

  test('a teacher may read seats but not create them', async () => {
    expect((await call('get', '/academic/seats', 'teacher')).status).toBe(200);
    expect((await call('post', '/academic/seats', 'teacher', { label: 'Z-1' })).status).toBe(403);
  });

  test('is not available to a tuition center', async () => {
    expect(
      (await call('get', '/academic/seats', 'tuitionOwner', undefined, 'tuition')).status
    ).toBe(403);
    expect(
      (await call('post', '/academic/seats', 'tuitionOwner', { label: 'T-1' }, 'tuition')).status
    ).toBe(403);
    expect(
      (
        await call(
          'get',
          `/academic/seats/availability?sectionId=${ctx.morning._id}`,
          'tuitionOwner',
          undefined,
          'tuition'
        )
      ).status
    ).toBe(403);
  });

  test('another study center sees none of these seats and cannot edit them', async () => {
    const mine = await seatByLabel('A-1');
    const theirs = await call('get', '/academic/seats', 'owner2', undefined, 'study2');
    expect(theirs.body).toEqual([]);
    const patch = await call(
      'patch',
      `/academic/seats/${mine._id}`,
      'owner2',
      { zone: 'Stolen' },
      'study2'
    );
    expect(patch.status).toBe(404);
    expect((await seatByLabel('A-1')).zone).toBe('Hall 1');
  });

  test('a seat can be renamed, its zone cleared with an empty string', async () => {
    const seat = await seatByLabel('C-1');
    const res = await call('patch', `/academic/seats/${seat._id}`, 'owner', {
      label: 'C-1x',
      zone: '',
    });
    expect(res.status).toBe(200);
    expect(res.body.label).toBe('C-1x');
    expect(res.body.zone).toBeUndefined();
  });

  test('rejects an empty change and unknown keys', async () => {
    const seat = await seatByLabel('A-2');
    expect((await call('patch', `/academic/seats/${seat._id}`, 'owner', {})).status).toBe(400);
    expect(
      (await call('patch', `/academic/seats/${seat._id}`, 'owner', { tenantId: 'x' })).status
    ).toBe(400);
  });
});

describe('standing allocations', () => {
  const assign = (studentId, sectionId, seatId, who = 'desk') =>
    call('post', '/academic/seat-allocations', who, {
      studentId: String(studentId),
      sectionId: String(sectionId),
      seatId: String(seatId),
    });

  test('a member gets a seat in a shift (AC1)', async () => {
    const a1 = await seatByLabel('A-1');
    const res = await assign(ctx.m1._id, ctx.morning._id, a1._id);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ status: 'active' });
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'seatAllocation.create' })
    );

    const b4 = await seatByLabel('B-4');
    expect((await assign(ctx.m1._id, ctx.evening._id, b4._id)).status).toBe(201);
  });

  test('the same seat is refused in the same shift and names the holder, but is free in another (AC2)', async () => {
    const a1 = await seatByLabel('A-1');
    const taken = await assign(ctx.m2._id, ctx.morning._id, a1._id);
    expect(taken.status).toBe(409);
    expect(taken.body.error).toMatch(/A-1 is held by Asha Study/);

    const evening = await assign(ctx.m2._id, ctx.evening._id, a1._id);
    expect(evening.status).toBe(201);
  });

  test('a member holds one seat per shift', async () => {
    const a2 = await seatByLabel('A-2');
    const res = await assign(ctx.m1._id, ctx.morning._id, a2._id);
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already has seat A-1/);
  });

  test('two desks taking the same seat at once: exactly one wins', async () => {
    const a5 = await seatByLabel('A-5');
    const results = await Promise.all([
      assign(ctx.m2._id, ctx.morning._id, a5._id),
      assign(ctx.m3._id, ctx.morning._id, a5._id),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    // Put it back for the later tests.
    await SeatAllocation.deleteMany({ tenantId: tenants.study._id, seatId: a5._id });
  });

  test('a learner who is not enrolled in the shift cannot sit in it', async () => {
    const a3 = await seatByLabel('A-3');
    const res = await assign(ctx.m3._id, ctx.evening._id, a3._id);
    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/Enrol the learner in this shift first/);
  });

  test('a walk-in cannot hold a standing seat', async () => {
    const a3 = await seatByLabel('A-3');
    const res = await assign(ctx.walkIn._id, ctx.morning._id, a3._id);
    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/walk-in/i);
  });

  test('a seat that is out of use cannot be assigned', async () => {
    const a6 = await seatByLabel('A-6');
    await call('patch', `/academic/seats/${a6._id}`, 'owner', { isActive: false });
    const res = await assign(ctx.m3._id, ctx.morning._id, a6._id);
    expect(res.status).toBe(422);
    await call('patch', `/academic/seats/${a6._id}`, 'owner', { isActive: true });
  });

  test('unknown learner, shift or seat are 404, and ids must be well formed', async () => {
    const a3 = await seatByLabel('A-3');
    const ghost = new mongoose.Types.ObjectId();
    expect((await assign(ghost, ctx.morning._id, a3._id)).status).toBe(404);
    expect((await assign(ctx.m3._id, ghost, a3._id)).status).toBe(404);
    expect((await assign(ctx.m3._id, ctx.morning._id, ghost)).status).toBe(404);
    expect(
      (
        await call('post', '/academic/seat-allocations', 'desk', {
          studentId: 'nope',
          sectionId: 'x',
          seatId: 'y',
        })
      ).status
    ).toBe(400);
  });

  test('only someone who may write students can assign', async () => {
    const a3 = await seatByLabel('A-3');
    expect((await assign(ctx.m3._id, ctx.morning._id, a3._id, 'teacher')).status).toBe(403);
  });

  test('another study center cannot assign across tenants', async () => {
    const a3 = await seatByLabel('A-3');
    const res = await call(
      'post',
      '/academic/seat-allocations',
      'owner2',
      {
        studentId: String(ctx.m3._id),
        sectionId: String(ctx.morning._id),
        seatId: String(a3._id),
      },
      'study2'
    );
    expect(res.status).toBe(404);
  });

  test('availability shows holders per shift and the day-pass pool', async () => {
    const morning = await call(
      'get',
      `/academic/seats/availability?sectionId=${ctx.morning._id}`,
      'teacher'
    );
    expect(morning.status).toBe(200);
    const held = morning.body.items.filter((i) => i.heldBy);
    expect(held.map((i) => [i.label, i.heldBy.name])).toEqual([['A-1', 'Asha Study']]);

    const evening = await call(
      'get',
      `/academic/seats/availability?sectionId=${ctx.evening._id}`,
      'teacher'
    );
    expect(evening.body.items.filter((i) => i.heldBy).map((i) => i.label)).toEqual(['A-1', 'B-4']);

    // Held anywhere: A-1 (both shifts) and B-4. Active seats minus those two.
    const active = await Seat.countDocuments({ tenantId: tenants.study._id, isActive: true });
    expect(morning.body.poolSize).toBe(active - 2);
    expect(evening.body.poolSize).toBe(active - 2);
  });

  test('the allocation list is filtered and carries the seat label and shift name', async () => {
    const res = await call('get', `/academic/seat-allocations?studentId=${ctx.m1._id}`, 'desk');
    expect(res.body.map((a) => [a.sectionId.name, a.seatId.label]).sort()).toEqual([
      ['Evening', 'B-4'],
      ['Morning', 'A-1'],
    ]);
  });

  test('a seat that is held cannot be taken out of use, and says who holds it', async () => {
    const a1 = await seatByLabel('A-1');
    const res = await call('patch', `/academic/seats/${a1._id}`, 'owner', { isActive: false });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/Asha Study/);
    expect((await seatByLabel('A-1')).isActive).toBe(true);
  });

  test('a move ends the old hold and creates the new one in one request', async () => {
    const mine = await SeatAllocation.findOne({
      tenantId: tenants.study._id,
      studentId: ctx.m1._id,
      sectionId: ctx.evening._id,
      status: 'active',
    }).lean();
    const c = await seatByLabel('B-5');
    const res = await call('patch', `/academic/seat-allocations/${mine._id}`, 'desk', {
      action: 'move',
      seatId: String(c._id),
    });
    expect(res.status).toBe(200);
    expect(String(res.body.seatId)).toBe(String(c._id));

    const old = await SeatAllocation.findById(mine._id).lean();
    expect(old.status).toBe('ended');
    expect(
      await SeatAllocation.countDocuments({
        tenantId: tenants.study._id,
        studentId: ctx.m1._id,
        sectionId: ctx.evening._id,
        status: 'active',
      })
    ).toBe(1);
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'seatAllocation.move' })
    );
  });

  test('a move onto a seat someone else holds fails and leaves the learner where they were', async () => {
    const mine = await SeatAllocation.findOne({
      tenantId: tenants.study._id,
      studentId: ctx.m1._id,
      sectionId: ctx.morning._id,
      status: 'active',
    }).lean();
    const a1Evening = await seatByLabel('A-1');
    // m2 holds A-1 in the evening; give m2 a morning seat too, then try to take it.
    const a3 = await seatByLabel('A-3');
    await assign(ctx.m2._id, ctx.morning._id, a3._id);

    const res = await call('patch', `/academic/seat-allocations/${mine._id}`, 'desk', {
      action: 'move',
      seatId: String(a3._id),
    });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/Ravi Study/);

    const still = await SeatAllocation.findById(mine._id).lean();
    expect(still.status).toBe('active');
    expect(String(still.seatId)).toBe(String(a1Evening._id));
    await SeatAllocation.deleteMany({
      tenantId: tenants.study._id,
      studentId: ctx.m2._id,
      sectionId: ctx.morning._id,
    });
  });

  test('moving to the seat already held is a no-op', async () => {
    const mine = await SeatAllocation.findOne({
      tenantId: tenants.study._id,
      studentId: ctx.m1._id,
      sectionId: ctx.morning._id,
      status: 'active',
    }).lean();
    const res = await call('patch', `/academic/seat-allocations/${mine._id}`, 'desk', {
      action: 'move',
      seatId: String(mine.seatId),
    });
    expect(res.status).toBe(200);
  });

  test('an allocation can be ended, and the seat is free again', async () => {
    const b5 = await seatByLabel('B-5');
    const mine = await SeatAllocation.findOne({
      tenantId: tenants.study._id,
      seatId: b5._id,
      status: 'active',
    }).lean();
    const res = await call('patch', `/academic/seat-allocations/${mine._id}`, 'desk', {
      action: 'end',
    });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ended');
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'seatAllocation.end' })
    );

    // Ending twice is a 404, not a second end.
    expect(
      (await call('patch', `/academic/seat-allocations/${mine._id}`, 'desk', { action: 'end' }))
        .status
    ).toBe(404);

    // The seat can now be deactivated.
    const off = await call('patch', `/academic/seats/${b5._id}`, 'owner', { isActive: false });
    expect(off.status).toBe(200);
  });
});

describe('ending an enrollment ends the seat (AC3, R15)', () => {
  const findHold = (student, section) =>
    SeatAllocation.findOne({
      tenantId: tenants.study._id,
      studentId: student._id,
      sectionId: section._id,
    }).lean();

  test.each(['dropped', 'completed'])('an enrollment marked %s frees its seat', async (status) => {
    const learner = await Student.create({
      tenantId: tenants.study._id,
      admissionNo: `E-${status}`,
      firstName: 'Leaver',
      lastName: status,
    });
    const enrollment = await enroll(tenants.study, learner, ctx.morning);
    const seat = await seatByLabel('A-4');
    await call('post', '/academic/seat-allocations', 'desk', {
      studentId: String(learner._id),
      sectionId: String(ctx.morning._id),
      seatId: String(seat._id),
    });

    const res = await call('patch', `/academic/enrollments/${enrollment._id}`, 'desk', { status });
    expect(res.status).toBe(200);
    expect((await findHold(learner, ctx.morning)).status).toBe('ended');

    // The seat can be given to someone else straight away.
    const next = await call('post', '/academic/seat-allocations', 'desk', {
      studentId: String(ctx.m3._id),
      sectionId: String(ctx.morning._id),
      seatId: String(seat._id),
    });
    expect(next.status).toBe(201);
    await SeatAllocation.deleteMany({ tenantId: tenants.study._id, seatId: seat._id });
  });

  test('a note-only change keeps the seat, and other shifts are untouched', async () => {
    const learner = await Student.create({
      tenantId: tenants.study._id,
      admissionNo: 'E-keep',
      firstName: 'Keeper',
      lastName: 'Study',
    });
    const morning = await enroll(tenants.study, learner, ctx.morning);
    const evening = await enroll(tenants.study, learner, ctx.evening);
    const a4 = await seatByLabel('A-4');
    const b1 = await seatByLabel('B-1');
    for (const [section, seat] of [
      [ctx.morning, a4],
      [ctx.evening, b1],
    ]) {
      await call('post', '/academic/seat-allocations', 'desk', {
        studentId: String(learner._id),
        sectionId: String(section._id),
        seatId: String(seat._id),
      });
    }

    await call('patch', `/academic/enrollments/${morning._id}`, 'desk', { notes: 'just a note' });
    expect((await findHold(learner, ctx.morning)).status).toBe('active');

    await call('patch', `/academic/enrollments/${morning._id}`, 'desk', { status: 'dropped' });
    expect((await findHold(learner, ctx.morning)).status).toBe('ended');
    expect((await findHold(learner, ctx.evening)).status).toBe('active');
    void evening;
    await SeatAllocation.deleteMany({ tenantId: tenants.study._id, studentId: learner._id });
  });

  test('a tuition center enrollment change still works and touches no allocation', async () => {
    const enrollment = await Enrollment.create({
      tenantId: tenants.tuition._id,
      studentId: ctx.tuitionStudent._id,
      sectionId: new mongoose.Types.ObjectId(),
    });
    const res = await call(
      'patch',
      `/academic/enrollments/${enrollment._id}`,
      'tuitionOwner',
      { status: 'dropped' },
      'tuition'
    );
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('dropped');
  });
});

describe('shift hours on a section', () => {
  test('a section takes start and end times, validated as HH:mm and ordered', async () => {
    const ok = await call('patch', `/academic/sections/${ctx.morning._id}`, 'owner', {
      startTime: '05:30',
      endTime: '13:30',
    });
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ startTime: '05:30', endTime: '13:30' });

    for (const bad of [
      { startTime: '25:00' },
      { startTime: '6:00' },
      { startTime: '14:00', endTime: '06:00' },
      { endTime: 'noon' },
    ]) {
      const res = await call('patch', `/academic/sections/${ctx.morning._id}`, 'owner', bad);
      expect(res.status).toBe(400);
    }
    const kept = await Section.findById(ctx.morning._id).lean();
    expect(kept).toMatchObject({ startTime: '05:30', endTime: '13:30' });

    await call('patch', `/academic/sections/${ctx.morning._id}`, 'owner', {
      startTime: '06:00',
      endTime: '14:00',
    });
  });

  test('null clears a time and other fields still patch as before', async () => {
    const section = await Section.create({
      tenantId: tenants.study._id,
      classId: ctx.klass._id,
      name: 'Night',
      startTime: '22:00',
    });
    const res = await call('patch', `/academic/sections/${section._id}`, 'owner', {
      startTime: null,
      name: 'Late',
    });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Late');
    expect(res.body.startTime).toBeUndefined();
  });

  test('a section is created without times exactly as before, or with them', async () => {
    const plain = await call('post', '/academic/sections', 'owner', {
      classId: String(ctx.klass._id),
      name: 'Plain',
    });
    expect(plain.status).toBe(201);
    expect(plain.body.startTime).toBeUndefined();

    const timed = await call('post', '/academic/sections', 'owner', {
      classId: String(ctx.klass._id),
      name: 'Timed',
      startTime: '09:00',
      endTime: '12:00',
    });
    expect(timed.body).toMatchObject({ startTime: '09:00', endTime: '12:00' });

    const bad = await call('post', '/academic/sections', 'owner', {
      classId: String(ctx.klass._id),
      name: 'Bad',
      startTime: '99:99',
    });
    expect(bad.status).toBe(400);
  });
});

describe('GET /me/seat', () => {
  test('a learner sees only their own shifts and seats, ordered by start time', async () => {
    const res = await call('get', '/me/seat', 'learner1');
    expect(res.status).toBe(200);
    expect(Object.keys(res.body).sort()).toEqual(['nextDue', 'plan', 'shifts']);
    // No plan sold yet: both are null, not an error.
    expect(res.body.plan).toBeNull();
    expect(res.body.nextDue).toBeNull();
    expect(res.body.shifts.map((s) => s.sectionName)).toEqual(['Morning', 'Evening']);
    expect(res.body.shifts[0]).toMatchObject({
      sectionName: 'Morning',
      startTime: '06:00',
      endTime: '14:00',
      seat: { label: 'A-1', zone: 'Hall 1' },
    });
    // The whitelist: nothing about anyone else, no ids of other learners.
    expect(JSON.stringify(res.body)).not.toMatch(/Ravi|S-2|learner2/);
    for (const shift of res.body.shifts) {
      expect(Object.keys(shift).sort()).toEqual(
        ['endTime', 'seat', 'sectionId', 'sectionName', 'startTime'].sort()
      );
    }
  });

  test('shows the learner’s own plan and what they owe, and nothing else about the fee', async () => {
    const structure = await FeeStructure.create({
      tenantId: tenants.study._id,
      name: 'Morning monthly',
      academicYearId: new mongoose.Types.ObjectId(),
      components: [{ label: 'Morning monthly', amount: 1200 }],
      plan: { kind: 'shift_plan', durationDays: 30 },
    });
    const day = 24 * 60 * 60 * 1000;
    await FeeAssignment.create({
      tenantId: tenants.study._id,
      studentId: ctx.m1._id,
      feeStructureId: structure._id,
      academicYearId: structure.academicYearId,
      totalAmount: 1200,
      discountAmount: 200,
      discountReason: 'Secret internal reason',
      dueDate: new Date(Date.now() - day),
      coversFrom: new Date(Date.now() - day),
      coversTo: new Date(Date.now() + 29 * day),
    });

    const res = await call('get', '/me/seat', 'learner1');
    expect(res.status).toBe(200);
    expect(res.body.plan.name).toBe('Morning monthly');
    expect(Object.keys(res.body.plan).sort()).toEqual(['coversFrom', 'coversTo', 'name']);
    // 1200 less the 200 discount, nothing paid yet.
    expect(res.body.nextDue.amount).toBe(1000);
    expect(Object.keys(res.body.nextDue).sort()).toEqual(['amount', 'dueDate']);
    expect(JSON.stringify(res.body)).not.toMatch(/Secret internal reason|discount/i);

    // Another learner never sees it.
    expect((await call('get', '/me/seat', 'learner2')).body.plan).toBeNull();
    await FeeAssignment.deleteMany({ tenantId: tenants.study._id });
  });

  test('a learner with no seat gets seat: null for each shift (EH2a)', async () => {
    const res = await call('get', '/me/seat', 'learner2');
    expect(res.status).toBe(200);
    const seats = res.body.shifts.map((s) => s.seat);
    // learner2 holds A-1 in the evening only (from the AC2 test above).
    expect(seats).toEqual([null, { label: 'A-1', zone: 'Hall 1' }]);
  });

  test('requires self:seat:read: staff roles are refused', async () => {
    expect((await call('get', '/me/seat', 'teacher')).status).toBe(403);
    expect((await call('get', '/me/seat', 'owner')).status).toBe(403);
  });

  test('is not available to a tuition center', async () => {
    expect((await call('get', '/me/seat', 'tuitionOwner', undefined, 'tuition')).status).toBe(403);
  });

  test('an account with no learner record is a 404, not another learner’s data', async () => {
    // The desk user holds no self: permission, so build a student-role member with no Student row.
    const role = await Role.findOne({ tenantId: tenants.study._id, templateKey: 'student' });
    const orphan = await makeMember(tenants.study, role, 'orphan');
    tokens.orphan = orphan.token;
    expect((await call('get', '/me/seat', 'orphan')).status).toBe(404);
  });
});
