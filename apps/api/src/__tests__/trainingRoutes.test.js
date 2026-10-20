// Drives the real /training router through a mini Express app (the full app.js
// cannot load under Jest — see orgTypeModuleGating.test.js) against an
// in-memory Mongo and the real Redis the permission cache uses.
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
const { Student } = await import('../models/Student.js');
const { TenantMembership } = await import('../models/TenantMembership.js');
const { AcademicYear } = await import('../models/AcademicYear.js');
const { Term } = await import('../models/Term.js');
const { Class } = await import('../models/Class.js');
const { Section } = await import('../models/Section.js');
const { Subject } = await import('../models/Subject.js');
const { Assignment } = await import('../models/Assignment.js');
const { Submission } = await import('../models/Submission.js');
const { Project } = await import('../models/Project.js');
const { signAccessToken, hashPassword } = await import('../services/auth.service.js');
const { requireModuleEnabled } = await import('../middleware/requireModuleEnabled.js');
const { errorHandler } = await import('../middleware/errorHandler.js');
const { default: trainingRouter } = await import('../routes/training.js');
const { redis } = await import('../config/redis.js');

let mongod;
let app;
const tenants = {};
const users = {};
const tokens = {};
let fx; // fixtures for tenant A
let fxB; // a section/subject/term in tenant B

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
    name: 'Career Ready run 1',
    startDate: new Date('2026-09-01'),
    endDate: new Date('2026-12-01'),
  });
  const klass = await Class.create({ tenantId: tenant._id, name: `Career Ready ${tag}` });
  const section = await Section.create({
    tenantId: tenant._id,
    classId: klass._id,
    name: 'Batch A',
  });
  const otherSection = await Section.create({
    tenantId: tenant._id,
    classId: klass._id,
    name: 'Batch B',
  });
  const subject = await Subject.create({ tenantId: tenant._id, name: 'Git', code: `GIT-${tag}` });
  return { year, term, klass, section, otherSection, subject };
}

const asStudent = (tenant, section, no, first) =>
  Student.create({
    tenantId: tenant._id,
    admissionNo: no,
    firstName: first,
    lastName: 'Rana',
    sectionId: section._id,
    status: 'active',
  });

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());

  const a = await makeTenant('college-a');
  const b = await makeTenant('college-b');
  tenants.A = a.tenant;
  tenants.B = b.tenant;

  for (const key of ['tenant_admin', 'principal', 'teacher', 'student']) {
    const m = await makeMember(a.tenant, a.roles[key], key);
    users[key] = m.user;
    tokens[key] = m.token;
  }
  const bTeacher = await makeMember(b.tenant, b.roles.teacher, 'bteacher');
  tokens.bTeacher = bTeacher.token;

  const f = await academicFixtures(a.tenant, 'A');
  fx = {
    ...f,
    s1: await asStudent(a.tenant, f.section, 'A-001', 'Asha'),
    s2: await asStudent(a.tenant, f.section, 'A-002', 'Bhavna'),
    outsider: await asStudent(a.tenant, f.otherSection, 'A-003', 'Chetan'),
  };
  fxB = await academicFixtures(b.tenant, 'B');

  app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.tenant = tenants[req.headers['x-tenant'] ?? 'A'];
    next();
  });
  app.use('/training', requireModuleEnabled('training'), trainingRouter);
  app.use(errorHandler);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
  redis.disconnect();
});

const call = (method, path, who, body, tenant = 'A') => {
  const req = request(app)[method](`/training${path}`).set('x-tenant', tenant);
  if (who) req.set('Authorization', `Bearer ${tokens[who]}`);
  return body === undefined ? req : req.send(body);
};

const assignmentBody = () => ({
  sectionId: String(fx.section._id),
  subjectId: String(fx.subject._id),
  termId: String(fx.term._id),
  title: 'Build a REST API',
  dueDate: '2026-11-20',
  maxScore: 10,
});

describe('permissions', () => {
  test('no token → 401', async () => {
    expect((await call('get', '/assignments')).status).toBe(401);
  });

  test('a student cannot reach the tenant-wide training routes', async () => {
    expect((await call('get', '/assignments', 'student')).status).toBe(403);
    expect((await call('post', '/assignments', 'student', assignmentBody())).status).toBe(403);
  });

  test('the TPO (principal) can read but not write', async () => {
    expect((await call('get', '/assignments', 'principal')).status).toBe(200);
    expect((await call('post', '/assignments', 'principal', assignmentBody())).status).toBe(403);
  });

  test('the trainer (teacher) can write', async () => {
    const res = await call('post', '/assignments', 'teacher', assignmentBody());
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ title: 'Build a REST API', maxScore: 10 });
  });

  test('a tenant without the training module gets 403', async () => {
    const t = await Tenant.create({ name: 'School', subdomain: 'plain-school', orgType: 'school' });
    tenants.S = t;
    const res = await call('get', '/assignments', 'tenant_admin', undefined, 'S');
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/not enabled/i);
  });
});

describe('assignments', () => {
  test('creation is audited and stored against the caller tenant', async () => {
    auditLog.mockClear();
    const res = await call('post', '/assignments', 'teacher', assignmentBody());
    expect(res.status).toBe(201);
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'training.assignment.create' })
    );
    const stored = await Assignment.findOne({ _id: res.body._id, tenantId: tenants.A._id });
    expect(String(stored.createdBy)).toBe(String(users.teacher._id));
  });

  test('refuses a section, subject or term from another tenant', async () => {
    for (const patch of [
      { sectionId: String(fxB.section._id) },
      { subjectId: String(fxB.subject._id) },
      { termId: String(fxB.term._id) },
    ]) {
      const res = await call('post', '/assignments', 'teacher', { ...assignmentBody(), ...patch });
      expect(res.status).toBe(404);
    }
  });

  test('another tenant sees none of it and cannot edit it', async () => {
    const created = await call('post', '/assignments', 'teacher', assignmentBody());
    const list = await call('get', '/assignments', 'bTeacher', undefined, 'B');
    expect(list.status).toBe(200);
    expect(list.body.find((a) => a._id === created.body._id)).toBeUndefined();

    const patch = await call(
      'patch',
      `/assignments/${created.body._id}`,
      'bTeacher',
      { title: 'hijack' },
      'B'
    );
    expect(patch.status).toBe(404);
  });

  test('the list reports submission counts per status', async () => {
    const created = (await call('post', '/assignments', 'teacher', assignmentBody())).body;
    await call('put', `/assignments/${created._id}/submissions/${fx.s1._id}`, 'teacher', {
      status: 'reviewed',
      score: 9,
    });
    await call('put', `/assignments/${created._id}/submissions/${fx.s2._id}`, 'teacher', {
      status: 'submitted',
    });
    const list = await call('get', `/assignments?sectionId=${fx.section._id}`, 'principal');
    const row = list.body.find((a) => a._id === created._id);
    expect(row.counts).toEqual({ pending: 0, submitted: 1, reviewed: 1 });
  });

  test('deleting an assignment removes its submissions', async () => {
    const created = (await call('post', '/assignments', 'teacher', assignmentBody())).body;
    await call('put', `/assignments/${created._id}/submissions/${fx.s1._id}`, 'teacher', {
      status: 'submitted',
    });
    expect((await call('delete', `/assignments/${created._id}`, 'teacher')).status).toBe(204);
    expect(
      await Submission.countDocuments({ tenantId: tenants.A._id, assignmentId: created._id })
    ).toBe(0);
  });
});

describe('submissions', () => {
  let assignmentId;
  beforeAll(async () => {
    assignmentId = (await call('post', '/assignments', 'teacher', assignmentBody())).body._id;
  });

  test('the roster lists every batch student, with or without a submission', async () => {
    const res = await call('get', `/assignments/${assignmentId}/submissions`, 'principal');
    expect(res.status).toBe(200);
    const names = res.body.map((r) => r.student.firstName).sort();
    expect(names).toEqual(['Asha', 'Bhavna']);
    expect(res.body.every((r) => r.submission === null || r.submission.status)).toBe(true);
  });

  test('upserting twice leaves one document and the latest values', async () => {
    const path = `/assignments/${assignmentId}/submissions/${fx.s1._id}`;
    await call('put', path, 'teacher', { status: 'submitted' });
    const res = await call('put', path, 'teacher', {
      status: 'reviewed',
      score: 7,
      feedback: 'Solid',
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'reviewed', score: 7, feedback: 'Solid' });
    expect(
      await Submission.countDocuments({
        tenantId: tenants.A._id,
        assignmentId,
        studentId: fx.s1._id,
      })
    ).toBe(1);
  });

  test('a score above the assignment max is rejected', async () => {
    const res = await call(
      'put',
      `/assignments/${assignmentId}/submissions/${fx.s2._id}`,
      'teacher',
      { status: 'reviewed', score: 11 }
    );
    expect(res.status).toBe(400);
  });

  test('a reviewed submission without a score is rejected', async () => {
    const res = await call(
      'put',
      `/assignments/${assignmentId}/submissions/${fx.s2._id}`,
      'teacher',
      { status: 'reviewed' }
    );
    expect(res.status).toBe(400);
  });

  test('a student outside the batch cannot be scored', async () => {
    const res = await call(
      'put',
      `/assignments/${assignmentId}/submissions/${fx.outsider._id}`,
      'teacher',
      { status: 'submitted' }
    );
    expect(res.status).toBe(404);
  });

  test('the TPO cannot write a submission', async () => {
    const res = await call(
      'put',
      `/assignments/${assignmentId}/submissions/${fx.s1._id}`,
      'principal',
      { status: 'submitted' }
    );
    expect(res.status).toBe(403);
  });

  test('lowering maxScore below an existing score is refused', async () => {
    const created = (await call('post', '/assignments', 'teacher', assignmentBody())).body;
    await call('put', `/assignments/${created._id}/submissions/${fx.s1._id}`, 'teacher', {
      status: 'reviewed',
      score: 9,
    });
    const res = await call('patch', `/assignments/${created._id}`, 'teacher', { maxScore: 5 });
    expect(res.status).toBe(409);
  });
});

describe('projects', () => {
  const body = () => ({
    sectionId: String(fx.section._id),
    termId: String(fx.term._id),
    name: 'Team 1 — Attendance app',
    repoUrl: 'https://github.com/rrcloud/team-1',
    memberIds: [String(fx.s1._id), String(fx.s2._id)],
    milestones: [{ title: 'Auth done', dueDate: '2026-11-10' }],
  });

  test('a trainer creates a project and a TPO can read it', async () => {
    const res = await call('post', '/projects', 'teacher', body());
    expect(res.status).toBe(201);
    const list = await call('get', `/projects?sectionId=${fx.section._id}`, 'principal');
    expect(list.status).toBe(200);
    expect(list.body.map((p) => p._id)).toContain(res.body._id);
  });

  test('members must belong to the batch', async () => {
    const res = await call('post', '/projects', 'teacher', {
      ...body(),
      memberIds: [String(fx.outsider._id)],
    });
    expect(res.status).toBe(404);
  });

  test('another tenant cannot patch it', async () => {
    const created = (await call('post', '/projects', 'teacher', body())).body;
    const res = await call('patch', `/projects/${created._id}`, 'bTeacher', { name: 'x' }, 'B');
    expect(res.status).toBe(404);
  });

  test('removing a member after review keeps the review score (EH7)', async () => {
    const created = (await call('post', '/projects', 'teacher', body())).body;
    await call('patch', `/projects/${created._id}`, 'teacher', {
      reviewScore: 82,
      reviewNotes: 'Clean demo',
    });
    const res = await call('patch', `/projects/${created._id}`, 'teacher', {
      memberIds: [String(fx.s1._id)],
    });
    expect(res.status).toBe(200);
    const stored = await Project.findOne({ _id: created._id, tenantId: tenants.A._id }).lean();
    expect(stored.memberIds).toHaveLength(1);
    expect(stored.reviewScore).toBe(82);
    expect(String(stored.reviewedBy)).toBe(String(users.teacher._id));
  });

  test('a milestone can be marked done', async () => {
    const created = (await call('post', '/projects', 'teacher', body())).body;
    const res = await call('patch', `/projects/${created._id}`, 'teacher', {
      milestones: [{ title: 'Auth done', dueDate: '2026-11-10', doneAt: '2026-11-09' }],
    });
    expect(res.body.milestones[0].doneAt).toBeTruthy();
  });
});
