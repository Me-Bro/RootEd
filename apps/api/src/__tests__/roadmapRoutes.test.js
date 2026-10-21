// Drives the real /training/roadmaps router through a mini Express app against
// an in-memory Mongo and the real Redis the permission cache uses.
import { jest } from '@jest/globals';

const auditLog = jest.fn().mockResolvedValue(undefined);
jest.unstable_mockModule('../services/audit.service.js', () => ({
  auditLog,
  processAuditLog: jest.fn(),
}));

const { MongoMemoryServer } = await import('mongodb-memory-server');
const { default: mongoose } = await import('mongoose');
const { default: express } = await import('express');
const { default: request } = await import('supertest');
const { Tenant } = await import('../models/Tenant.js');
const { Role, DEFAULT_ROLE_TEMPLATES } = await import('../models/Role.js');
const { User } = await import('../models/User.js');
const { TenantMembership } = await import('../models/TenantMembership.js');
const { AcademicYear } = await import('../models/AcademicYear.js');
const { Term } = await import('../models/Term.js');
const { Class } = await import('../models/Class.js');
const { Section } = await import('../models/Section.js');
const { RoadmapItem } = await import('../models/RoadmapItem.js');
const { RoadmapProgress } = await import('../models/RoadmapProgress.js');
const { signAccessToken, hashPassword } = await import('../services/auth.service.js');
const { requireModuleEnabled } = await import('../middleware/requireModuleEnabled.js');
const { errorHandler } = await import('../middleware/errorHandler.js');
const { default: roadmapRouter } = await import('../routes/roadmap.js');
const { redis } = await import('../config/redis.js');

let mongod;
let app;
const tenants = {};
const tokens = {};
let fx;
let fxB;

async function makeTenant(subdomain) {
  const tenant = await Tenant.create({ name: subdomain, subdomain, orgType: 'college' });
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

let n = 0;
async function makeMember(tenant, role, label) {
  n += 1;
  const user = await User.create({
    email: `${label}${n}@college.test`,
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

async function academicFixtures(tenant, tag) {
  const year = await AcademicYear.create({
    tenantId: tenant._id,
    name: `2026-${tag}`,
    startDate: new Date('2026-06-01'),
    endDate: new Date('2027-03-31'),
    isActive: true,
  });
  const term = await Term.create({
    tenantId: tenant._id,
    academicYearId: year._id,
    name: 'Run 1',
    startDate: new Date('2026-09-01'),
    endDate: new Date('2026-12-01'),
  });
  const klass = await Class.create({ tenantId: tenant._id, name: `Career Ready ${tag}` });
  const section = await Section.create({ tenantId: tenant._id, classId: klass._id, name: 'A' });
  return { term, section };
}

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());

  const a = await makeTenant('college-a');
  const b = await makeTenant('college-b');
  tenants.A = a.tenant;
  tenants.B = b.tenant;
  for (const key of ['tenant_admin', 'principal', 'teacher', 'student']) {
    tokens[key] = await makeMember(a.tenant, a.roles[key], key);
  }
  tokens.bTeacher = await makeMember(b.tenant, b.roles.teacher, 'bteacher');

  fx = await academicFixtures(a.tenant, 'A');
  fxB = await academicFixtures(b.tenant, 'B');

  app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.tenant = tenants[req.headers['x-tenant'] ?? 'A'];
    next();
  });
  app.use('/training/roadmaps', requireModuleEnabled('training'), roadmapRouter);
  app.use(errorHandler);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
  redis.disconnect();
});

const call = (method, path, who, body, tenant = 'A') => {
  const req = request(app)[method](`/training/roadmaps${path}`).set('x-tenant', tenant);
  if (who) req.set('Authorization', `Bearer ${tokens[who]}`);
  return body === undefined ? req : req.send(body);
};

const roadmapBody = (extra = {}) => ({
  sectionId: String(fx.section._id),
  termId: String(fx.term._id),
  title: 'Full-stack track',
  scheduleMode: 'weekly',
  ...extra,
});

const makeRoadmap = async (extra) => (await call('post', '', 'teacher', roadmapBody(extra))).body;
const addItem = (roadmapId, body, who = 'teacher') =>
  call('post', `/${roadmapId}/items`, who, {
    type: 'theory',
    title: 'Item',
    weekNumber: 1,
    ...body,
  });

describe('permissions', () => {
  test('no token → 401', async () => {
    expect((await call('get', '')).status).toBe(401);
  });

  test('a student cannot reach the mentor routes', async () => {
    expect((await call('get', '', 'student')).status).toBe(403);
    expect((await call('post', '', 'student', roadmapBody())).status).toBe(403);
  });

  test('the principal reads but cannot write', async () => {
    const r = await makeRoadmap();
    expect((await call('get', '', 'principal')).status).toBe(200);
    expect((await call('get', `/${r._id}`, 'principal')).status).toBe(200);
    expect((await call('post', '', 'principal', roadmapBody())).status).toBe(403);
    expect((await call('patch', `/${r._id}`, 'principal', { published: true })).status).toBe(403);
    expect((await addItem(r._id, {}, 'principal')).status).toBe(403);
    expect((await call('delete', `/${r._id}`, 'principal')).status).toBe(403);
  });

  test('a tenant without the training module gets 403', async () => {
    tenants.S = await Tenant.create({ name: 'School', subdomain: 'plain', orgType: 'school' });
    expect((await call('get', '', 'tenant_admin', undefined, 'S')).status).toBe(403);
  });
});

describe('roadmaps', () => {
  test('create is audited, stored against the tenant, and starts unpublished', async () => {
    auditLog.mockClear();
    const res = await call('post', '', 'teacher', roadmapBody({ title: 'HTML &amp; CSS' }));
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ title: 'HTML & CSS', published: false });
    expect(String(res.body.tenantId)).toBe(String(tenants.A._id));
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'training.roadmap.create' })
    );
  });

  test('refuses a section or term from another tenant', async () => {
    for (const patch of [
      { sectionId: String(fxB.section._id) },
      { termId: String(fxB.term._id) },
    ]) {
      expect((await call('post', '', 'teacher', roadmapBody(patch))).status).toBe(404);
    }
  });

  test('list filters by batch and reports item counts', async () => {
    const r = await makeRoadmap({ title: 'Counted' });
    await addItem(r._id, {});
    await addItem(r._id, {});
    const res = await call('get', `?sectionId=${fx.section._id}&termId=${fx.term._id}`, 'teacher');
    expect(res.status).toBe(200);
    expect(res.body.find((x) => x._id === r._id).itemCount).toBe(2);
    const other = await call('get', `?sectionId=${new mongoose.Types.ObjectId()}`, 'teacher');
    expect(other.body).toEqual([]);
  });

  test('publish and unpublish', async () => {
    const r = await makeRoadmap();
    const on = await call('patch', `/${r._id}`, 'teacher', { published: true });
    expect(on.body.published).toBe(true);
    const off = await call('patch', `/${r._id}`, 'teacher', { published: false });
    expect(off.body.published).toBe(false);
  });

  test('batch and term cannot be re-pointed', async () => {
    const r = await makeRoadmap();
    const res = await call('patch', `/${r._id}`, 'teacher', { sectionId: String(fx.section._id) });
    expect(res.status).toBe(400);
  });

  test('changing the timeline mode is refused once it has items, allowed while empty', async () => {
    const r = await makeRoadmap();
    expect((await call('patch', `/${r._id}`, 'teacher', { scheduleMode: 'daily' })).status).toBe(
      200
    );
    await addItem(r._id, { weekNumber: undefined, dayNumber: 1 });
    const res = await call('patch', `/${r._id}`, 'teacher', { scheduleMode: 'dated' });
    expect(res.status).toBe(409);
  });

  test('another tenant cannot see, edit or delete it', async () => {
    const r = await makeRoadmap();
    expect((await call('get', `/${r._id}`, 'bTeacher', undefined, 'B')).status).toBe(404);
    expect((await call('patch', `/${r._id}`, 'bTeacher', { title: 'hijack' }, 'B')).status).toBe(
      404
    );
    expect((await call('delete', `/${r._id}`, 'bTeacher', undefined, 'B')).status).toBe(404);
    const list = await call('get', '', 'bTeacher', undefined, 'B');
    expect(list.body.find((x) => x._id === r._id)).toBeUndefined();
    expect((await addItem(r._id, {}, 'bTeacher')).status).toBe(403);
  });

  test('a malformed id is 404, not 500', async () => {
    expect((await call('get', '/nope', 'teacher')).status).toBe(404);
  });

  test('delete removes its items and every student progress row', async () => {
    const r = await makeRoadmap();
    const item = (await addItem(r._id, {})).body;
    await RoadmapProgress.create({
      tenantId: tenants.A._id,
      roadmapId: r._id,
      itemId: item._id,
      studentId: new mongoose.Types.ObjectId(),
      completedAt: new Date(),
    });
    expect((await call('delete', `/${r._id}`, 'teacher')).status).toBe(204);
    expect(await RoadmapItem.countDocuments({ tenantId: tenants.A._id, roadmapId: r._id })).toBe(0);
    expect(
      await RoadmapProgress.countDocuments({ tenantId: tenants.A._id, roadmapId: r._id })
    ).toBe(0);
  });
});

describe('items', () => {
  test('new items are appended in order, and GET returns them sorted', async () => {
    const r = await makeRoadmap();
    const first = (await addItem(r._id, { title: 'one' })).body;
    const second = (await addItem(r._id, { title: 'two', type: 'practical' })).body;
    expect(second.order).toBeGreaterThan(first.order);
    expect(String(second.sectionId)).toBe(String(fx.section._id));
    const res = await call('get', `/${r._id}`, 'teacher');
    expect(res.body.items.map((i) => i.title)).toEqual(['one', 'two']);
  });

  test('the schedule field must match the roadmap mode', async () => {
    const weekly = await makeRoadmap();
    expect((await addItem(weekly._id, { weekNumber: undefined })).status).toBe(400);
    expect((await addItem(weekly._id, { weekNumber: undefined, dayNumber: 2 })).status).toBe(400);
    expect((await addItem(weekly._id, { dueDate: '2026-10-01' })).status).toBe(400);

    const dated = await makeRoadmap({ scheduleMode: 'dated' });
    expect(
      (await addItem(dated._id, { weekNumber: undefined, dueDate: '2026-10-01' })).status
    ).toBe(201);

    const none = await makeRoadmap({ scheduleMode: 'none' });
    expect((await addItem(none._id, { weekNumber: undefined })).status).toBe(201);
    expect((await addItem(none._id, {})).status).toBe(400);
  });

  test('a javascript: resource link is refused', async () => {
    const r = await makeRoadmap();
    const res = await addItem(r._id, { resourceUrl: 'javascript:alert(1)' });
    expect(res.status).toBe(400);
  });

  test('prerequisites must be items of the same roadmap', async () => {
    const r = await makeRoadmap();
    const other = await makeRoadmap();
    const foreign = (await addItem(other._id, {})).body;
    const res = await addItem(r._id, { locked: true, unlockAfter: [foreign._id] });
    expect(res.status).toBe(400);
  });

  test('a prerequisite loop is refused on update', async () => {
    const r = await makeRoadmap();
    const a = (await addItem(r._id, { title: 'a' })).body;
    const b = (await addItem(r._id, { title: 'b', locked: true, unlockAfter: [a._id] })).body;
    const loop = await call('patch', `/${r._id}/items/${a._id}`, 'teacher', {
      locked: true,
      unlockAfter: [b._id],
    });
    expect(loop.status).toBe(400);
    const self = await call('patch', `/${r._id}/items/${a._id}`, 'teacher', {
      locked: true,
      unlockAfter: [a._id],
    });
    expect(self.status).toBe(400);
  });

  test('unlocking an item that still has prerequisites is refused until they are cleared', async () => {
    const r = await makeRoadmap();
    const a = (await addItem(r._id, { title: 'a' })).body;
    const b = (await addItem(r._id, { title: 'b', locked: true, unlockAfter: [a._id] })).body;
    expect(
      (await call('patch', `/${r._id}/items/${b._id}`, 'teacher', { locked: false })).status
    ).toBe(400);
    const ok = await call('patch', `/${r._id}/items/${b._id}`, 'teacher', {
      locked: false,
      unlockAfter: [],
    });
    expect(ok.status).toBe(200);
    expect(ok.body.locked).toBe(false);
  });

  test('update changes fields and null clears an optional one', async () => {
    const r = await makeRoadmap();
    const item = (await addItem(r._id, { prompt: 'Why?' })).body;
    const res = await call('patch', `/${r._id}/items/${item._id}`, 'teacher', {
      title: 'Renamed',
      prompt: null,
    });
    expect(res.status).toBe(200);
    expect(res.body.title).toBe('Renamed');
    expect(res.body.prompt).toBeUndefined();
  });

  test('an item of another roadmap is 404 through this roadmap', async () => {
    const r = await makeRoadmap();
    const other = await makeRoadmap();
    const item = (await addItem(other._id, {})).body;
    const res = await call('patch', `/${r._id}/items/${item._id}`, 'teacher', { title: 'x' });
    expect(res.status).toBe(404);
  });

  test('deleting an item frees what waited on it and drops its progress', async () => {
    const r = await makeRoadmap();
    const a = (await addItem(r._id, { title: 'a' })).body;
    const b = (await addItem(r._id, { title: 'b', locked: true, unlockAfter: [a._id] })).body;
    await RoadmapProgress.create({
      tenantId: tenants.A._id,
      roadmapId: r._id,
      itemId: a._id,
      studentId: new mongoose.Types.ObjectId(),
    });
    expect((await call('delete', `/${r._id}/items/${a._id}`, 'teacher')).status).toBe(204);
    const after = await RoadmapItem.findOne({ _id: b._id, tenantId: tenants.A._id }).lean();
    expect(after.unlockAfter).toEqual([]);
    expect(await RoadmapProgress.countDocuments({ tenantId: tenants.A._id, itemId: a._id })).toBe(
      0
    );
  });

  test('reorder applies the new sequence and needs every item exactly once', async () => {
    const r = await makeRoadmap();
    const a = (await addItem(r._id, { title: 'a' })).body;
    const b = (await addItem(r._id, { title: 'b' })).body;
    const c = (await addItem(r._id, { title: 'c' })).body;

    const res = await call('put', `/${r._id}/items/order`, 'teacher', {
      itemIds: [c._id, a._id, b._id],
    });
    expect(res.status).toBe(200);
    expect(res.body.map((i) => i.title)).toEqual(['c', 'a', 'b']);

    expect(
      (await call('put', `/${r._id}/items/order`, 'teacher', { itemIds: [a._id, b._id] })).status
    ).toBe(400);
    expect(
      (
        await call('put', `/${r._id}/items/order`, 'teacher', {
          itemIds: [a._id, b._id, String(new mongoose.Types.ObjectId())],
        })
      ).status
    ).toBe(400);
  });
});
