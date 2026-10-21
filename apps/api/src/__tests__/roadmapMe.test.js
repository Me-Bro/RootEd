// A student's own roadmap through the real /me router (mini Express app, in-memory
// Mongo, the real Redis the permission cache uses). Identity and batch come from
// the session; nothing in the request can widen them.
import { jest } from '@jest/globals';

jest.unstable_mockModule('../services/audit.service.js', () => ({
  auditLog: jest.fn().mockResolvedValue(undefined),
  processAuditLog: jest.fn(),
}));

const { MongoMemoryServer } = await import('mongodb-memory-server');
const { default: mongoose } = await import('mongoose');
const { default: express } = await import('express');
const { default: request } = await import('supertest');
const { Tenant } = await import('../models/Tenant.js');
const { Role, DEFAULT_ROLE_TEMPLATES } = await import('../models/Role.js');
const { User } = await import('../models/User.js');
const { Student } = await import('../models/Student.js');
const { TenantMembership } = await import('../models/TenantMembership.js');
const { AcademicYear } = await import('../models/AcademicYear.js');
const { Term } = await import('../models/Term.js');
const { Class } = await import('../models/Class.js');
const { Section } = await import('../models/Section.js');
const { Roadmap } = await import('../models/Roadmap.js');
const { RoadmapItem } = await import('../models/RoadmapItem.js');
const { RoadmapProgress } = await import('../models/RoadmapProgress.js');
const { Enrollment } = await import('../models/Enrollment.js');
const { signAccessToken, hashPassword } = await import('../services/auth.service.js');
const { errorHandler } = await import('../middleware/errorHandler.js');
const { default: meRouter } = await import('../routes/me.js');
const { redis } = await import('../config/redis.js');

let mongod;
let app;
const tenants = {};
const tokens = {};
let fx; // tenant A fixtures
let fxB; // tenant B fixtures

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
  roles.readOnly = await Role.create({
    tenantId: tenant._id,
    name: 'read-only student',
    permissions: ['self:training:read'],
  });
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
  return { user, token: signAccessToken({ sub: user._id.toString() }) };
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
  const otherSection = await Section.create({
    tenantId: tenant._id,
    classId: klass._id,
    name: 'B',
  });
  return { term, section, otherSection };
}

// A student record linked to a login (so /me resolves them) in a given batch.
async function linkedStudent(tenant, role, section, no, first) {
  const member = await makeMember(tenant, role, first.toLowerCase());
  const student = await Student.create({
    tenantId: tenant._id,
    admissionNo: no,
    firstName: first,
    lastName: 'Rana',
    sectionId: section?._id,
    userId: member.user._id,
    status: 'active',
  });
  return { ...member, student };
}

async function roadmapWithItems(tenant, f, { title, published = true, section = f.section }, defs) {
  const roadmap = await Roadmap.create({
    tenantId: tenant._id,
    sectionId: section._id,
    termId: f.term._id,
    title,
    scheduleMode: 'none',
    published,
  });
  const items = [];
  for (const [i, def] of defs.entries()) {
    const { after, ...fields } = def;
    items.push(
      await RoadmapItem.create({
        tenantId: tenant._id,
        roadmapId: roadmap._id,
        sectionId: section._id,
        order: i + 1,
        locked: after !== undefined || Boolean(def.locked),
        unlockAfter: after === undefined ? [] : [items[after]._id],
        ...fields,
      })
    );
  }
  return { roadmap, items };
}

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());

  const a = await makeTenant('college-a');
  const b = await makeTenant('college-b');
  tenants.A = a.tenant;
  tenants.B = b.tenant;

  fx = await academicFixtures(a.tenant, 'A');
  fxB = await academicFixtures(b.tenant, 'B');

  const s1 = await linkedStudent(a.tenant, a.roles.student, fx.section, 'A-001', 'Asha');
  tokens.s1 = s1.token;
  fx.s1 = s1.student;
  const readOnly = await linkedStudent(a.tenant, a.roles.readOnly, fx.section, 'A-002', 'Bhavna');
  tokens.readOnly = readOnly.token;
  const outsider = await linkedStudent(
    a.tenant,
    a.roles.student,
    fx.otherSection,
    'A-003',
    'Chetan'
  );
  tokens.outsider = outsider.token;
  const noBatch = await linkedStudent(a.tenant, a.roles.student, null, 'A-004', 'Deepa');
  tokens.noBatch = noBatch.token;
  // Classmates with no login, and one who dropped out of the batch.
  const classmate = (no, first) =>
    Student.create({
      tenantId: a.tenant._id,
      admissionNo: no,
      firstName: first,
      lastName: 'Rana',
      sectionId: fx.section._id,
      status: 'active',
    });
  fx.farah = await classmate('A-005', 'Farah');
  fx.gita = await classmate('A-006', 'Gita');
  fx.hari = await classmate('A-007', 'Hari');
  await Enrollment.create({
    tenantId: a.tenant._id,
    studentId: fx.hari._id,
    sectionId: fx.section._id,
    status: 'dropped',
  });
  // A login with the student role but no student record.
  tokens.unlinked = (await makeMember(a.tenant, a.roles.student, 'unlinked')).token;
  tokens.teacher = (await makeMember(a.tenant, a.roles.teacher, 'teacher')).token;
  tokens.bStudent = (
    await linkedStudent(b.tenant, b.roles.student, fxB.section, 'B-001', 'Esha')
  ).token;

  fx.main = await roadmapWithItems(a.tenant, fx, { title: 'Full-stack' }, [
    { type: 'theory', title: 'HTML basics', body: 'open body', prompt: 'What is a tag?' },
    { type: 'practical', title: 'Build a page', body: 'secret body', prompt: 'secret?', after: 0 },
    {
      type: 'assignment',
      title: 'Deploy it',
      body: 'deploy body',
      resourceUrl: 'https://example.com/deploy',
    },
    { type: 'theory', title: 'Mentor review', body: 'held body', locked: true },
  ]);
  fx.draft = await roadmapWithItems(a.tenant, fx, { title: 'Draft', published: false }, [
    { type: 'theory', title: 'Draft item' },
  ]);
  fx.other = await roadmapWithItems(
    a.tenant,
    fx,
    { title: 'Other batch', section: fx.otherSection },
    [{ type: 'theory', title: 'Other item' }]
  );
  fxB.main = await roadmapWithItems(b.tenant, fxB, { title: 'College B road' }, [
    { type: 'theory', title: 'B item' },
  ]);

  app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.tenant = tenants[req.headers['x-tenant'] ?? 'A'];
    next();
  });
  app.use('/me', meRouter);
  app.use(errorHandler);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
  redis.disconnect();
});

afterEach(async () => {
  await RoadmapProgress.deleteMany({}, { _bypassTenantScope: true });
});

const call = (method, path, who, body, tenant = 'A') => {
  const req = request(app)[method](`/me${path}`).set('x-tenant', tenant);
  if (who) req.set('Authorization', `Bearer ${tokens[who]}`);
  return body === undefined ? req : req.send(body);
};

const item = (name) => fx.main.items.find((i) => i.title === name)._id.toString();
const put = (name, who, body, id = item(name)) => call('put', `/roadmap/items/${id}`, who, body);
const mine = async (who = 's1') => (await call('get', '/roadmap', who)).body.roadmaps;
const itemOf = (roadmaps, title) => roadmaps.flatMap((r) => r.items).find((i) => i.title === title);

describe('GET /me/roadmap', () => {
  test('shows only the published roadmaps of the student own batch', async () => {
    const res = await call('get', '/roadmap', 's1');
    expect(res.status).toBe(200);
    expect(res.body.roadmaps.map((r) => r.title)).toEqual(['Full-stack']);
  });

  test('lists items in order with the student own progress', async () => {
    await put('HTML basics', 's1', { completed: true, answer: 'A tag is markup' });
    const roadmaps = await mine();
    expect(roadmaps[0].items.map((i) => i.title)).toEqual([
      'HTML basics',
      'Build a page',
      'Deploy it',
      'Mentor review',
    ]);
    expect(itemOf(roadmaps, 'HTML basics')).toMatchObject({
      completed: true,
      answer: 'A tag is markup',
      open: true,
    });
    expect(itemOf(roadmaps, 'Deploy it').completed).toBe(false);
  });

  test('an open item carries its content', async () => {
    const roadmaps = await mine();
    expect(itemOf(roadmaps, 'HTML basics')).toMatchObject({
      body: 'open body',
      prompt: 'What is a tag?',
    });
    expect(itemOf(roadmaps, 'Deploy it').resourceUrl).toBe('https://example.com/deploy');
  });

  test('a closed item withholds its content and says what it waits on', async () => {
    const locked = itemOf(await mine(), 'Build a page');
    expect(locked).toMatchObject({ locked: true, open: false, waitingOn: ['HTML basics'] });
    expect(locked).not.toHaveProperty('body');
    expect(locked).not.toHaveProperty('prompt');
    expect(locked).not.toHaveProperty('resourceUrl');
  });

  test('a mentor-held item is closed with nothing to wait on', async () => {
    const held = itemOf(await mine(), 'Mentor review');
    expect(held).toMatchObject({ open: false, waitingOn: [] });
    expect(held).not.toHaveProperty('body');
  });

  test('completing the prerequisite opens the item and reveals its content', async () => {
    await put('HTML basics', 's1', { completed: true });
    const opened = itemOf(await mine(), 'Build a page');
    expect(opened).toMatchObject({ open: true, body: 'secret body', waitingOn: [] });
  });

  test('a student in no batch sees an empty list', async () => {
    const res = await call('get', '/roadmap', 'noBatch');
    expect(res.status).toBe(200);
    expect(res.body.roadmaps).toEqual([]);
  });

  test('a login with no student record is 404', async () => {
    expect((await call('get', '/roadmap', 'unlinked')).status).toBe(404);
  });

  test('another batch and another college see only their own', async () => {
    expect((await mine('outsider')).map((r) => r.title)).toEqual(['Other batch']);
    const b = await call('get', '/roadmap', 'bStudent', undefined, 'B');
    expect(b.body.roadmaps.map((r) => r.title)).toEqual(['College B road']);
  });

  test('staff without a self permission are refused', async () => {
    expect((await call('get', '/roadmap', 'teacher')).status).toBe(403);
  });
});

describe('PUT /me/roadmap/items/:itemId', () => {
  test('completing stamps the date once and un-ticking clears it', async () => {
    const first = await put('HTML basics', 's1', { completed: true });
    expect(first.status).toBe(200);
    expect(first.body.completedAt).toBeTruthy();

    const again = await put('HTML basics', 's1', { completed: true });
    expect(again.body.completedAt).toBe(first.body.completedAt);

    const undone = await put('HTML basics', 's1', { completed: false });
    expect(undone.body.completedAt).toBeNull();
  });

  test('an answer is saved without completing the item', async () => {
    const res = await put('HTML basics', 's1', { answer: 'Markup' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ answer: 'Markup', completedAt: null });
  });

  test('a locked item cannot be completed, answered or linked until it opens', async () => {
    for (const body of [{ completed: true }, { answer: 'x' }]) {
      const res = await put('Build a page', 's1', body);
      expect(res.status).toBe(409);
      expect(res.body.error).toMatch(/locked/i);
    }
    expect(await RoadmapProgress.countDocuments({ tenantId: tenants.A._id })).toBe(0);
  });

  test('a mentor-held item stays closed whatever the student has completed', async () => {
    await put('HTML basics', 's1', { completed: true });
    expect((await put('Mentor review', 's1', { completed: true })).status).toBe(409);
  });

  test('un-ticking a prerequisite re-closes the item for new work but keeps what was done', async () => {
    await put('HTML basics', 's1', { completed: true });
    await put('Build a page', 's1', { completed: true, answer: 'done' });
    await put('HTML basics', 's1', { completed: false });

    expect((await put('Build a page', 's1', { answer: 'more' })).status).toBe(409);
    const kept = itemOf(await mine(), 'Build a page');
    expect(kept).toMatchObject({ completed: true, answer: 'done', open: false });
    // The student may still take their own tick back.
    expect((await put('Build a page', 's1', { completed: false })).status).toBe(200);
  });

  test('an item of another batch, an unpublished roadmap or another college is 404', async () => {
    const otherItem = fx.other.items[0]._id.toString();
    const draftItem = fx.draft.items[0]._id.toString();
    const bItem = fxB.main.items[0]._id.toString();
    expect((await put(null, 's1', { completed: true }, otherItem)).status).toBe(404);
    expect((await put(null, 's1', { completed: true }, draftItem)).status).toBe(404);
    expect((await put(null, 's1', { completed: true }, bItem)).status).toBe(404);
    // A college B student, in college B, naming a college A item id.
    const crossTenant = await call(
      'put',
      `/roadmap/items/${item('HTML basics')}`,
      'bStudent',
      { completed: true },
      'B'
    );
    expect(crossTenant.status).toBe(404);
    // And a college B login is simply not a member of college A.
    expect((await put(null, 'bStudent', { completed: true }, item('HTML basics'))).status).toBe(
      403
    );
    expect((await put(null, 's1', { completed: true }, 'not-an-id')).status).toBe(404);
    expect(await RoadmapProgress.countDocuments({ tenantId: tenants.A._id })).toBe(0);
  });

  test('a student in no batch cannot reach any item', async () => {
    expect((await put('HTML basics', 'noBatch', { completed: true })).status).toBe(404);
  });

  test('a studentId in the body is refused, not obeyed', async () => {
    const res = await put('HTML basics', 's1', {
      completed: true,
      studentId: String(new mongoose.Types.ObjectId()),
    });
    expect(res.status).toBe(400);
    expect(await RoadmapProgress.countDocuments({ tenantId: tenants.A._id })).toBe(0);
  });

  test('an empty body is refused', async () => {
    expect((await put('HTML basics', 's1', {})).status).toBe(400);
  });

  test('progress is stored against the caller, not anyone else', async () => {
    await put('HTML basics', 's1', { completed: true });
    const rows = await RoadmapProgress.find({ tenantId: tenants.A._id }).lean();
    expect(rows).toHaveLength(1);
    expect(String(rows[0].studentId)).toBe(String(fx.s1._id));
  });

  test('only an assignment takes a link, and only http(s)', async () => {
    expect((await put('HTML basics', 's1', { linkUrl: 'https://github.com/a/b' })).status).toBe(
      400
    );
    expect((await put('Deploy it', 's1', { linkUrl: 'javascript:alert(1)' })).status).toBe(400);
    const ok = await put('Deploy it', 's1', { linkUrl: 'https://github.com/a/b?x=1&amp;y=2' });
    expect(ok.status).toBe(200);
    expect(ok.body.linkUrl).toBe('https://github.com/a/b?x=1&y=2');
  });

  test('text the sanitiser escaped is stored as typed', async () => {
    await put('HTML basics', 's1', { answer: 'Tom &amp; Jerry &lt;3' });
    expect(itemOf(await mine(), 'HTML basics').answer).toBe('Tom & Jerry <3');
  });

  test('an over-long answer is refused', async () => {
    expect((await put('HTML basics', 's1', { answer: 'x'.repeat(5001) })).status).toBe(400);
  });

  test('a read-only role can read but not change anything', async () => {
    expect((await call('get', '/roadmap', 'readOnly')).status).toBe(200);
    expect((await put('HTML basics', 'readOnly', { completed: true })).status).toBe(403);
  });

  test('two taps at once leave a single progress row', async () => {
    const results = await Promise.all([
      put('HTML basics', 's1', { completed: true }),
      put('HTML basics', 's1', { completed: true }),
      put('HTML basics', 's1', { completed: true }),
    ]);
    expect(results.map((r) => r.status)).toEqual([200, 200, 200]);
    expect(await RoadmapProgress.countDocuments({ tenantId: tenants.A._id })).toBe(1);
  });
});

// Completes the named items for a student straight in the database.
const finish = (student, names, extra = {}) =>
  RoadmapProgress.insertMany(
    names.map((name) => ({
      tenantId: tenants.A._id,
      roadmapId: fx.main.roadmap._id,
      itemId: item(name),
      studentId: student._id,
      completedAt: new Date(),
      ...extra,
    }))
  );

describe('progress summary on GET /me/roadmap', () => {
  test('counts completed over every item, by type, with locked items in the total', async () => {
    await put('HTML basics', 's1', { completed: true });
    const { summary } = (await call('get', '/roadmap', 's1')).body;
    expect(summary).toMatchObject({ completed: 1, total: 4, pct: 25 });
    expect(summary.byType).toEqual({
      theory: { completed: 1, total: 2 },
      practical: { completed: 0, total: 1 },
      assignment: { completed: 0, total: 1 },
    });
  });

  test('a student with no roadmap has no percentage, not 0%', async () => {
    const { summary } = (await call('get', '/roadmap', 'noBatch')).body;
    expect(summary).toMatchObject({ completed: 0, total: 0, pct: null });
  });
});

describe('GET /me/roadmap/leaderboard', () => {
  test('ranks the batch by completed items, ties sharing a rank, and marks the caller', async () => {
    await finish(fx.farah, ['HTML basics', 'Deploy it']);
    await finish(fx.gita, ['HTML basics']);
    await put('HTML basics', 's1', { completed: true });

    const res = await call('get', '/roadmap/leaderboard', 's1');
    expect(res.status).toBe(200);
    expect(res.body.leaderboard).toEqual([
      { rank: 1, displayName: 'Farah Rana', completed: 2, total: 4, pct: 50, isMe: false },
      { rank: 2, displayName: 'Asha Rana', completed: 1, total: 4, pct: 25, isMe: true },
      { rank: 2, displayName: 'Gita Rana', completed: 1, total: 4, pct: 25, isMe: false },
      { rank: 4, displayName: 'Bhavna Rana', completed: 0, total: 4, pct: 0, isMe: false },
    ]);
  });

  test('exposes only the whitelisted keys: no answers, links, dates or ids', async () => {
    await finish(fx.farah, ['Deploy it'], {
      answer: 'private answer',
      linkUrl: 'https://x.test/a',
    });
    const { leaderboard } = (await call('get', '/roadmap/leaderboard', 's1')).body;
    for (const row of leaderboard) {
      expect(Object.keys(row).sort()).toEqual([
        'completed',
        'displayName',
        'isMe',
        'pct',
        'rank',
        'total',
      ]);
    }
    expect(JSON.stringify(leaderboard)).not.toMatch(/private answer|x\.test|completedAt/);
  });

  test('leaves out a student who dropped out of the batch', async () => {
    await finish(fx.hari, ['HTML basics', 'Deploy it']);
    const { leaderboard } = (await call('get', '/roadmap/leaderboard', 's1')).body;
    expect(leaderboard.map((r) => r.displayName)).not.toContain('Hari Rana');
    expect(leaderboard).toHaveLength(4);
  });

  test('shows only the caller own batch, never another', async () => {
    const { leaderboard } = (await call('get', '/roadmap/leaderboard', 'outsider')).body;
    // The other batch has a roadmap but only Chetan on it.
    expect(leaderboard.map((r) => r.displayName)).toEqual(['Chetan Rana']);
  });

  test('is empty with no batch, and when the batch has no published items', async () => {
    expect((await call('get', '/roadmap/leaderboard', 'noBatch')).body.leaderboard).toEqual([]);
    await RoadmapItem.deleteMany({ tenantId: tenants.A._id, roadmapId: fx.other.roadmap._id });
    expect((await call('get', '/roadmap/leaderboard', 'outsider')).body.leaderboard).toEqual([]);
    await RoadmapItem.create({
      tenantId: tenants.A._id,
      roadmapId: fx.other.roadmap._id,
      sectionId: fx.otherSection._id,
      type: 'theory',
      title: 'Other item',
      order: 1,
    });
  });

  test('a login with no student record is 404; staff are 403; another college sees its own', async () => {
    expect((await call('get', '/roadmap/leaderboard', 'unlinked')).status).toBe(404);
    expect((await call('get', '/roadmap/leaderboard', 'teacher')).status).toBe(403);
    const b = await call('get', '/roadmap/leaderboard', 'bStudent', undefined, 'B');
    expect(b.body.leaderboard.map((r) => r.displayName)).toEqual(['Esha Rana']);
  });

  test('a read-only role can see the leaderboard', async () => {
    expect((await call('get', '/roadmap/leaderboard', 'readOnly')).status).toBe(200);
  });

  test('a batch parameter in the query changes nothing', async () => {
    const res = await call('get', `/roadmap/leaderboard?sectionId=${fx.otherSection._id}`, 's1');
    expect(res.body.leaderboard.map((r) => r.displayName)).toContain('Asha Rana');
    expect(res.body.leaderboard.map((r) => r.displayName)).not.toContain('Chetan Rana');
  });
});
