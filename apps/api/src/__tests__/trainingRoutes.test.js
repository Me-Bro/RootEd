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
const { PlacementApplication } = await import('../models/PlacementApplication.js');
const { AttendanceRecord } = await import('../models/AttendanceRecord.js');
const { Grade } = await import('../models/Grade.js');
const { GradeLock } = await import('../models/GradeLock.js');
const { Employer } = await import('../models/Employer.js');
const { invalidatePermissions } = await import('../middleware/requirePermission.js');
const { default: meRouter } = await import('../routes/me.js');
const { default: adminRouter } = await import('../routes/admin.js');
const { Enrollment } = await import('../models/Enrollment.js');
const { default: academicRouter } = await import('../routes/academic.js');
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
  app.use('/academic', requireModuleEnabled('academic'), academicRouter);
  app.use('/me', meRouter);
  app.use('/admin', adminRouter);
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

// ── Phase 3: placement, consent and admin-decided completion ──────────────────

const callAcademic = (method, path, who, body, tenant = 'A') => {
  const req = request(app)[method](`/academic${path}`).set('x-tenant', tenant);
  if (who) req.set('Authorization', `Bearer ${tokens[who]}`);
  return body === undefined ? req : req.send(body);
};

describe('employers', () => {
  test('a trainer adds one, a TPO can list it, a duplicate name is a 409', async () => {
    const res = await call('post', '/employers', 'teacher', { name: 'Acme Software' });
    expect(res.status).toBe(201);
    expect((await call('get', '/employers', 'principal')).body.map((e) => e.name)).toContain(
      'Acme Software'
    );
    expect((await call('post', '/employers', 'teacher', { name: 'Acme Software' })).status).toBe(
      409
    );
    expect((await call('post', '/employers', 'principal', { name: 'Nope' })).status).toBe(403);
  });

  test('another college neither sees nor edits it', async () => {
    const created = (await call('post', '/employers', 'teacher', { name: 'Private Co' })).body;
    const list = await call('get', '/employers', 'bTeacher', undefined, 'B');
    expect(list.body.map((e) => e._id)).not.toContain(created._id);
    const patch = await call('patch', `/employers/${created._id}`, 'bTeacher', { name: 'x' }, 'B');
    expect(patch.status).toBe(404);
  });
});

describe('placements', () => {
  let employer;
  beforeAll(async () => {
    employer = (await call('post', '/employers', 'teacher', { name: 'Placement Co' })).body;
  });
  const body = (role = 'Junior Developer') => ({
    studentId: String(fx.s1._id),
    employerId: employer._id,
    role,
  });

  test('creates an application at the applied stage with its date', async () => {
    const res = await call('post', '/placements', 'teacher', body('Intern'));
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ stage: 'applied', role: 'Intern' });
    expect(res.body.appliedAt).toBeTruthy();
  });

  test('the same student, employer and role cannot be applied twice', async () => {
    await call('post', '/placements', 'teacher', body('Tester'));
    expect((await call('post', '/placements', 'teacher', body('Tester'))).status).toBe(409);
  });

  test('moves forward with a date, refuses to go backwards (EH5)', async () => {
    const app1 = (await call('post', '/placements', 'teacher', body('Analyst'))).body;
    const moved = await call('patch', `/placements/${app1._id}`, 'teacher', {
      stage: 'interviewed',
    });
    expect(moved.status).toBe(200);
    expect(moved.body.stage).toBe('interviewed');
    expect(moved.body.interviewedAt).toBeTruthy();

    const back = await call('patch', `/placements/${app1._id}`, 'teacher', { stage: 'applied' });
    expect(back.status).toBe(400);
    expect(back.body.error).toMatch(/cannot move/i);
  });

  test('each stage keeps its own date so outcomes are reportable separately', async () => {
    const a = (await call('post', '/placements', 'teacher', body('Support'))).body;
    await call('patch', `/placements/${a._id}`, 'teacher', { stage: 'offered' });
    const stored = await PlacementApplication.findOne({
      _id: a._id,
      tenantId: tenants.A._id,
    }).lean();
    expect(stored.offeredAt).toBeTruthy();
    expect(stored.interviewedAt).toBeUndefined();
  });

  test('refuses a student or employer from another college', async () => {
    const other = (await call('post', '/employers', 'bTeacher', { name: 'B Employer' }, 'B')).body;
    const foreignEmployer = await call('post', '/placements', 'teacher', {
      ...body('X'),
      employerId: other._id,
    });
    expect(foreignEmployer.status).toBe(404);
    const foreignStudent = await call('post', '/placements', 'teacher', {
      ...body('Y'),
      studentId: String(new mongoose.Types.ObjectId()),
    });
    expect(foreignStudent.status).toBe(404);
  });

  test('lists a batch with student and employer names, readable by the TPO', async () => {
    const res = await call('get', `/placements?sectionId=${fx.section._id}`, 'principal');
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body[0]).toMatchObject({
      student: { firstName: 'Asha' },
      employer: { name: 'Placement Co' },
    });
    const outside = await call('get', `/placements?sectionId=${fx.otherSection._id}`, 'principal');
    expect(outside.body).toEqual([]);
  });

  test('a student account cannot list placements', async () => {
    expect((await call('get', '/placements', 'student')).status).toBe(403);
  });
});

describe('placement consent', () => {
  test('a trainer records it with who and when, and the roster shows it', async () => {
    const res = await call('put', `/students/${fx.s2._id}/consent`, 'teacher', { granted: true });
    expect(res.status).toBe(200);
    const stored = await Student.findOne({ _id: fx.s2._id, tenantId: tenants.A._id }).lean();
    expect(stored.placementConsent.granted).toBe(true);
    expect(String(stored.placementConsent.recordedBy)).toBe(String(users.teacher._id));
    expect(stored.placementConsent.at).toBeTruthy();

    const roster = await call('get', `/enrollments?sectionId=${fx.section._id}`, 'principal');
    const row = roster.body.find((r) => r.student.firstName === 'Bhavna');
    expect(row.student.placementConsent.granted).toBe(true);
  });

  test('another college cannot change it', async () => {
    const res = await call(
      'put',
      `/students/${fx.s1._id}/consent`,
      'bTeacher',
      { granted: true },
      'B'
    );
    expect(res.status).toBe(404);
  });

  test('the generic student update cannot set it', async () => {
    const res = await callAcademic('patch', `/students/${fx.s1._id}`, 'tenant_admin', {
      firstName: 'Asha',
      placementConsent: { granted: true, recordedBy: String(users.teacher._id) },
    });
    expect(res.status).toBe(200);
    const stored = await Student.findOne({ _id: fx.s1._id, tenantId: tenants.A._id }).lean();
    expect(stored.placementConsent?.granted).toBeUndefined();
  });

  test('nor through a dotted path into it', async () => {
    const res = await callAcademic('patch', `/students/${fx.s1._id}`, 'tenant_admin', {
      'placementConsent.granted': true,
    });
    expect(res.status).toBe(200);
    const stored = await Student.findOne({ _id: fx.s1._id, tenantId: tenants.A._id }).lean();
    expect(stored.placementConsent?.granted).toBeUndefined();
  });

  test('the TPO cannot record consent', async () => {
    const res = await call('put', `/students/${fx.s1._id}/consent`, 'principal', {
      granted: true,
    });
    expect(res.status).toBe(403);
  });
});

describe('admin-decided completion', () => {
  const decision = (status, extra = {}) => ({
    studentId: String(fx.s1._id),
    sectionId: String(fx.section._id),
    status,
    ...extra,
  });
  const enrollmentOf = (student) =>
    Enrollment.findOne({
      tenantId: tenants.A._id,
      studentId: student._id,
      sectionId: fx.section._id,
    }).lean();

  test('only the tenant_admin can decide', async () => {
    expect((await call('put', '/completion', 'teacher', decision('completed'))).status).toBe(403);
    expect((await call('put', '/completion', 'principal', decision('completed'))).status).toBe(403);
    expect((await call('put', '/completion', 'student', decision('completed'))).status).toBe(403);
    expect(await enrollmentOf(fx.s1)).toBeNull();
  });

  test('the admin completes a student, creating the enrollment row if needed, audited', async () => {
    auditLog.mockClear();
    const res = await call(
      'put',
      '/completion',
      'tenant_admin',
      decision('completed', { notes: 'Met all targets' })
    );
    expect(res.status).toBe(200);
    const row = await enrollmentOf(fx.s1);
    expect(row).toMatchObject({ status: 'completed', notes: 'Met all targets' });
    expect(row.endDate).toBeTruthy();
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'training.completion.set' })
    );
  });

  test('reverting to active clears the end date (EH8) and is audited', async () => {
    auditLog.mockClear();
    const res = await call('put', '/completion', 'tenant_admin', decision('active'));
    expect(res.status).toBe(200);
    expect((await enrollmentOf(fx.s1)).endDate).toBeNull();
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'training.completion.set',
        before: expect.objectContaining({ status: 'completed' }),
      })
    );
  });

  test('the roster lists every student with a status, defaulting to active', async () => {
    await call('put', '/completion', 'tenant_admin', decision('completed'));
    const res = await call('get', `/enrollments?sectionId=${fx.section._id}`, 'principal');
    expect(res.status).toBe(200);
    const byName = Object.fromEntries(res.body.map((r) => [r.student.firstName, r.status]));
    expect(byName).toEqual({ Asha: 'completed', Bhavna: 'active' });
  });

  test('a dropped student stays visible here but leaves the assignment roster', async () => {
    const drop = (status) => ({
      studentId: String(fx.s2._id),
      sectionId: String(fx.section._id),
      status,
    });
    await call('put', '/completion', 'tenant_admin', drop('dropped'));
    const roster = await call('get', `/enrollments?sectionId=${fx.section._id}`, 'tenant_admin');
    expect(roster.body.find((r) => r.student.firstName === 'Bhavna').status).toBe('dropped');

    const assignmentId = (await call('post', '/assignments', 'teacher', assignmentBody())).body._id;
    const batch = await call('get', `/assignments/${assignmentId}/submissions`, 'teacher');
    expect(batch.body.map((r) => r.student.firstName)).toEqual(['Asha']);

    await call('put', '/completion', 'tenant_admin', drop('active'));
  });

  test('refuses a student who is not on the batch, or a section from another college', async () => {
    const off = await call('put', '/completion', 'tenant_admin', {
      ...decision('completed'),
      studentId: String(fx.outsider._id),
    });
    expect(off.status).toBe(404);
    const foreign = await call('put', '/completion', 'tenant_admin', {
      ...decision('completed'),
      sectionId: String(fxB.section._id),
    });
    expect(foreign.status).toBe(404);
  });

  test('rejects an unknown status', async () => {
    const res = await call('put', '/completion', 'tenant_admin', decision('graduated'));
    expect(res.status).toBe(400);
  });

  describe('bulk', () => {
    const bulk = (studentIds, status = 'completed', extra = {}) => ({
      studentIds: studentIds.map(String),
      sectionId: String(fx.section._id),
      status,
      ...extra,
    });

    test('only the tenant_admin can decide for many', async () => {
      const body = bulk([fx.s1._id, fx.s2._id]);
      expect((await call('put', '/completion/bulk', 'teacher', body)).status).toBe(403);
      expect((await call('put', '/completion/bulk', 'principal', body)).status).toBe(403);
    });

    test('decides every student, one audit entry each, and can be reverted', async () => {
      auditLog.mockClear();
      const res = await call(
        'put',
        '/completion/bulk',
        'tenant_admin',
        bulk([fx.s1._id, fx.s2._id], 'completed', { notes: 'Batch signed off' })
      );
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ updated: 2 });
      for (const s of [fx.s1, fx.s2]) {
        expect(await enrollmentOf(s)).toMatchObject({
          status: 'completed',
          notes: 'Batch signed off',
        });
      }
      expect(
        auditLog.mock.calls.filter(([a]) => a.action === 'training.completion.set')
      ).toHaveLength(2);

      await call('put', '/completion/bulk', 'tenant_admin', bulk([fx.s1._id, fx.s2._id], 'active'));
      expect((await enrollmentOf(fx.s1)).endDate).toBeNull();
    });

    test('changes nothing when any student is not on the batch', async () => {
      const before = await enrollmentOf(fx.s1);
      const res = await call(
        'put',
        '/completion/bulk',
        'tenant_admin',
        bulk([fx.s1._id, fx.outsider._id])
      );
      expect(res.status).toBe(404);
      expect(await enrollmentOf(fx.s1)).toEqual(before);
    });

    test('rejects an empty or duplicated list, and a section from another college', async () => {
      expect((await call('put', '/completion/bulk', 'tenant_admin', bulk([]))).status).toBe(400);
      expect(
        (await call('put', '/completion/bulk', 'tenant_admin', bulk([fx.s1._id, fx.s1._id]))).status
      ).toBe(400);
      const foreign = await call('put', '/completion/bulk', 'tenant_admin', {
        ...bulk([fx.s1._id]),
        sectionId: String(fxB.section._id),
      });
      expect(foreign.status).toBe(404);
    });
  });
});

describe('the generic enrollment route is not a completion bypass (AC11)', () => {
  let enrollment;
  beforeAll(async () => {
    const role = await Role.create({
      tenantId: tenants.A._id,
      name: 'registrar',
      permissions: ['students:read', 'students:write'],
    });
    const registrar = await makeMember(tenants.A, role, 'registrar');
    tokens.registrar = registrar.token;
    enrollment = (
      await callAcademic('post', '/enrollments', 'tenant_admin', {
        studentId: String(fx.outsider._id),
        sectionId: String(fx.otherSection._id),
      })
    ).body;
  });
  const statusOf = async () =>
    (await Enrollment.findOne({ _id: enrollment._id, tenantId: tenants.A._id }).lean()).status;

  test('a students:write holder without training:complete cannot mark completed', async () => {
    const res = await callAcademic('patch', `/enrollments/${enrollment._id}`, 'registrar', {
      status: 'completed',
    });
    expect(res.status).toBe(403);
    expect(await statusOf()).toBe('active');
  });

  test('nor can they reverse a completion someone else recorded', async () => {
    await callAcademic('patch', `/enrollments/${enrollment._id}`, 'tenant_admin', {
      status: 'completed',
    });
    const res = await callAcademic('patch', `/enrollments/${enrollment._id}`, 'registrar', {
      status: 'active',
    });
    expect(res.status).toBe(403);
    expect(await statusOf()).toBe('completed');
  });

  test('re-enrolling a completed student through POST is the same decision', async () => {
    expect(await statusOf()).toBe('completed');
    const res = await callAcademic('post', '/enrollments', 'registrar', {
      studentId: String(fx.outsider._id),
      sectionId: String(fx.otherSection._id),
    });
    expect(res.status).toBe(403);
    expect(await statusOf()).toBe('completed');
    // The administrator may, and re-enrolling someone who simply dropped is not blocked.
    expect(
      (
        await callAcademic('post', '/enrollments', 'tenant_admin', {
          studentId: String(fx.outsider._id),
          sectionId: String(fx.otherSection._id),
        })
      ).status
    ).toBe(201);
    await callAcademic('patch', `/enrollments/${enrollment._id}`, 'tenant_admin', {
      status: 'completed',
    });
  });

  test('the same holder can still edit notes', async () => {
    const res = await callAcademic('patch', `/enrollments/${enrollment._id}`, 'registrar', {
      notes: 'transferred batch',
    });
    expect(res.status).toBe(200);
  });

  test('a college without the training module keeps the old behaviour', async () => {
    const plain = await Tenant.create({
      name: 'Plain 2',
      subdomain: 'plain-two',
      orgType: 'school',
    });
    tenants.P = plain;
    const role = await Role.create({
      tenantId: plain._id,
      name: 'registrar',
      permissions: ['students:read', 'students:write'],
    });
    tokens.plainReg = (await makeMember(plain, role, 'plainreg')).token;
    const cls = await Class.create({ tenantId: plain._id, name: 'C' });
    const sec = await Section.create({ tenantId: plain._id, classId: cls._id, name: 'A' });
    const stu = await Student.create({
      tenantId: plain._id,
      admissionNo: 'P-1',
      firstName: 'Plain',
      lastName: 'Student',
      sectionId: sec._id,
    });
    const enr = await Enrollment.create({
      tenantId: plain._id,
      studentId: stu._id,
      sectionId: sec._id,
    });

    const res = await callAcademic(
      'patch',
      `/enrollments/${enr._id}`,
      'plainReg',
      { status: 'completed' },
      'P'
    );
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('completed');
  });
});

// ── Phase 4: metrics, readiness, report, /me/progress, cross-college outcomes ─
//
// A fresh college (C) so every figure is exactly what is set up here, whatever
// earlier tests left behind in college A. Hand-worked figures:
//   s1 completed, s2 active, s3 dropped          → completion 1 of 3 = 33.3%
//   attendance s1 4P+1A (80%), s2 5P (100%)      → pooled 9/10 = 90% (s3 ignored)
//   baseline/final s1 40→70, s2 50→60            → avg improvement 20
//   mock interview s1 75                          → 1 of 2 eligible = 50%
//   one 20-mark assignment, s1 reviewed 15        → s1 75%, s2 0%
//   project (s1, s2) reviewed 90                  → 2 of 2 = 100%
//   placements s1 joined, s2 applied              → applied 2, interviewed 1, offered 1, joined 1
//   readiness s1 = (80·20 + 75·20 + 70·25 + 90·20 + 75·15) / 100 = 77.75 → 77.8
describe('metrics, readiness, report and student progress', () => {
  let C;
  let cx;
  const ctoken = {};
  const callC = (method, path, who, body) => {
    const req = request(app)[method](path).set('x-tenant', 'C');
    if (who) req.set('Authorization', `Bearer ${ctoken[who]}`);
    return body === undefined ? req : req.send(body);
  };
  const qs = () => `sectionId=${cx.section._id}&termId=${cx.term._id}`;

  beforeAll(async () => {
    const made = await makeTenant('college-c');
    C = made.tenant;
    tenants.C = C;
    for (const key of ['tenant_admin', 'principal', 'teacher', 'student']) {
      ctoken[key] = (await makeMember(C, made.roles[key], `c${key}`)).token;
    }
    const linked = await makeMember(C, made.roles.student, 'clinked');
    ctoken.linked = linked.token;

    cx = await academicFixtures(C, 'C');
    const [s1, s2, s3] = await Promise.all([
      asStudent(C, cx.section, 'C-001', 'Asha'),
      asStudent(C, cx.section, 'C-002', 'Bhavna'),
      asStudent(C, cx.section, 'C-003', 'Chetan'),
    ]);
    cx.s1 = s1;
    cx.s2 = s2;
    cx.s3 = s3;
    await Student.updateOne({ tenantId: C._id, _id: s1._id }, { userId: linked.user._id });
    await invalidatePermissions(C._id.toString(), linked.user._id.toString());

    const on = (day) => new Date(`2026-09-${String(day).padStart(2, '0')}T00:00:00Z`);
    const base = {
      tenantId: C._id,
      entityType: 'student',
      sectionId: cx.section._id,
      markedBy: linked.user._id,
    };
    const mark = (student, day, status) =>
      AttendanceRecord.create({ ...base, entityId: student._id, date: on(day), status });
    for (let day = 2; day <= 5; day += 1) await mark(s1, day, 'present');
    await mark(s1, 6, 'absent');
    for (let day = 2; day <= 6; day += 1) await mark(s2, day, 'present');
    for (let day = 2; day <= 6; day += 1) await mark(s3, day, 'absent');
    // Outside the programme run: must not be counted in the batch figure.
    await AttendanceRecord.create({
      ...base,
      entityId: s1._id,
      date: new Date('2027-02-01'),
      status: 'absent',
    });

    const g = (student, assessmentType, score) =>
      Grade.create({
        tenantId: C._id,
        studentId: student._id,
        sectionId: cx.section._id,
        subjectId: cx.subject._id,
        termId: cx.term._id,
        academicYearId: cx.year._id,
        assessmentType,
        score,
      });
    await g(s1, 'baseline', 40);
    await g(s1, 'final', 70);
    await g(s2, 'baseline', 50);
    await g(s2, 'final', 60);
    await g(s1, 'mock_interview', 75);

    const assignment = await Assignment.create({
      tenantId: C._id,
      sectionId: cx.section._id,
      subjectId: cx.subject._id,
      termId: cx.term._id,
      title: 'Capstone API',
      dueDate: new Date('2026-10-15'),
      maxScore: 20,
    });
    await Submission.create({
      tenantId: C._id,
      assignmentId: assignment._id,
      studentId: s1._id,
      status: 'reviewed',
      score: 15,
      feedback: 'Strong work',
    });
    await Submission.create({
      tenantId: C._id,
      assignmentId: assignment._id,
      studentId: s2._id,
      status: 'submitted',
    });

    await Project.create({
      tenantId: C._id,
      sectionId: cx.section._id,
      termId: cx.term._id,
      name: 'Team Alpha',
      repoUrl: 'https://github.com/rrcloud/alpha',
      memberIds: [s1._id, s2._id],
      reviewScore: 90,
    });

    const employer = await Employer.create({ tenantId: C._id, name: 'Acme C' });
    await PlacementApplication.create({
      tenantId: C._id,
      studentId: s1._id,
      employerId: employer._id,
      role: 'Developer',
      stage: 'joined',
      appliedAt: new Date('2026-10-01'),
      interviewedAt: new Date('2026-10-05'),
      offeredAt: new Date('2026-10-10'),
      joinedAt: new Date('2026-10-20'),
    });
    await PlacementApplication.create({
      tenantId: C._id,
      studentId: s2._id,
      employerId: employer._id,
      role: 'Developer',
      stage: 'applied',
      appliedAt: new Date('2026-10-02'),
    });

    await Enrollment.create({
      tenantId: C._id,
      studentId: s1._id,
      sectionId: cx.section._id,
      status: 'completed',
      endDate: new Date('2026-12-01'),
    });
    await Enrollment.create({
      tenantId: C._id,
      studentId: s3._id,
      sectionId: cx.section._id,
      status: 'dropped',
      endDate: new Date('2026-10-01'),
    });

    // Publish only the *final* grades, as a trainer would for the results.
    await GradeLock.create({
      tenantId: C._id,
      sectionId: cx.section._id,
      subjectId: cx.subject._id,
      termId: cx.term._id,
      assessmentType: 'final',
      publishedBy: linked.user._id,
    });
  });

  describe('GET /training/metrics', () => {
    test('returns every pilot figure, hand-checked', async () => {
      const res = await callC('get', `/training/metrics?${qs()}`, 'principal');
      expect(res.status).toBe(200);
      const m = res.body.metrics;
      expect(m.enrolled).toBe(3);
      expect(m.active).toBe(2);
      expect(m.attendance).toMatchObject({ pct: 90, met: true, studentsBelowTarget: 0 });
      expect(m.completion).toMatchObject({
        completed: 1,
        enrolled: 3,
        dropped: 1,
        pct: 33.3,
        met: false,
      });
      expect(m.project).toMatchObject({ completed: 2, eligible: 2, pct: 100, met: true });
      expect(m.mockInterview).toMatchObject({ completed: 1, eligible: 2, pct: 50, met: false });
      expect(m.improvement).toEqual({ avgDelta: 20, studentsMeasured: 2 });
      expect(m.placement).toEqual({
        applied: 2,
        interviewed: 1,
        offered: 1,
        joined: 1,
        rejected: 0,
      });
      expect(res.body.term.name).toBe('Career Ready run 1');
    });

    test('a student account and a missing term are refused', async () => {
      expect((await callC('get', `/training/metrics?${qs()}`, 'student')).status).toBe(403);
      expect(
        (await callC('get', `/training/metrics?sectionId=${cx.section._id}`, 'principal')).status
      ).toBe(400);
      expect(
        (
          await callC(
            'get',
            `/training/metrics?sectionId=${cx.section._id}&termId=${new mongoose.Types.ObjectId()}`,
            'principal'
          )
        ).status
      ).toBe(404);
    });

    test('another college cannot read this batch', async () => {
      const res = await request(app)
        .get(`/training/metrics?${qs()}`)
        .set('x-tenant', 'A')
        .set('Authorization', `Bearer ${tokens.teacher}`);
      expect(res.status).toBe(404);
    });

    test('a batch with nobody in it returns nulls, not NaN', async () => {
      const res = await callC(
        'get',
        `/training/metrics?sectionId=${cx.otherSection._id}&termId=${cx.term._id}`,
        'principal'
      );
      expect(res.status).toBe(200);
      expect(res.body.metrics.enrolled).toBe(0);
      expect(res.body.metrics.completion.pct).toBeNull();
      expect(JSON.stringify(res.body)).not.toMatch(/NaN/);
    });
  });

  describe('GET /training/readiness', () => {
    test('lists each student with their components, flagged provisional', async () => {
      const res = await callC('get', `/training/readiness?${qs()}`, 'teacher');
      expect(res.status).toBe(200);
      const asha = res.body.rows.find((r) => r.student.firstName === 'Asha');
      expect(asha).toMatchObject({
        status: 'completed',
        attendancePct: 80,
        assignmentsPct: 75,
        finalAvg: 70,
        delta: 30,
        projectScore: 90,
        mockScore: 75,
        placementStage: 'joined',
      });
      expect(asha.readiness.score).toBeCloseTo(77.8, 1);
      expect(asha.readiness.provisional).toBe(true);
      const bhavna = res.body.rows.find((r) => r.student.firstName === 'Bhavna');
      expect(bhavna.mockScore).toBeNull();
      expect(res.body.rows.find((r) => r.student.firstName === 'Chetan').status).toBe('dropped');
    });
  });

  describe('GET /training/report.pdf', () => {
    const binary = (res, cb) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => cb(null, Buffer.concat(chunks)));
    };

    test('streams a PDF for the batch', async () => {
      const res = await callC('get', `/training/report.pdf?${qs()}`, 'principal')
        .buffer(true)
        .parse(binary);
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/application\/pdf/);
      expect(res.headers['content-disposition']).toMatch(/attachment/);
      expect(res.body.subarray(0, 4).toString()).toBe('%PDF');
    });

    test('a student cannot download it', async () => {
      expect((await callC('get', `/training/report.pdf?${qs()}`, 'student')).status).toBe(403);
    });
  });

  describe('GET /me/progress', () => {
    test('shows the student their own progress, published and reviewed only', async () => {
      const res = await callC('get', '/me/progress', 'linked');
      expect(res.status).toBe(200);
      const body = res.body;
      expect(body.status).toBe('completed');
      expect(body.attendance).toMatchObject({ pct: 80, present: 4, absent: 1 });
      // Only the published `final`; the baseline and mock interview are not out yet.
      expect(body.grades).toHaveLength(1);
      expect(body.grades[0]).toMatchObject({ assessmentType: 'final', score: 70 });
      expect(body.summary.delta).toBeNull();
      expect(body.summary.mockScore).toBeNull();
      expect(body.assignments[0]).toMatchObject({
        title: 'Capstone API',
        status: 'reviewed',
        score: 15,
      });
      expect(body.project).toMatchObject({ name: 'Team Alpha', reviewScore: 90, teamSize: 2 });
      expect(body.placements[0]).toMatchObject({ employer: 'Acme C', stage: 'joined' });
      expect(body.summary.readiness.provisional).toBe(true);
    });

    test('never contains another student, whatever the caller asks for', async () => {
      const res = await callC('get', `/me/progress?studentId=${cx.s2._id}`, 'linked');
      expect(res.status).toBe(200);
      const text = JSON.stringify(res.body);
      expect(text).not.toContain('Bhavna');
      expect(text).not.toContain('C-002');
      expect(res.body.attendance.present).toBe(4); // still Asha's
    });

    test('a score is hidden until the trainer has reviewed it', async () => {
      await Submission.updateOne(
        { tenantId: C._id, studentId: cx.s1._id },
        { status: 'submitted', score: null, feedback: 'draft note' }
      );
      const res = await callC('get', '/me/progress', 'linked');
      expect(res.body.assignments[0]).toMatchObject({
        status: 'submitted',
        score: null,
        feedback: null,
      });
      expect(res.body.summary.assignmentsPct).toBe(0);
      await Submission.updateOne(
        { tenantId: C._id, studentId: cx.s1._id },
        { status: 'reviewed', score: 15, feedback: 'Strong work' }
      );
    });

    test('an account with no linked student record gets 404', async () => {
      expect((await callC('get', '/me/progress', 'student')).status).toBe(404);
    });

    test('a tenant-wide token without the self permission is refused', async () => {
      expect((await callC('get', '/me/progress', 'teacher')).status).toBe(403);
    });
  });

  describe('grade statistics ignore training diagnostics', () => {
    // s1 holds baseline 40, final 70 and mock interview 75 in the one subject/term.
    const query = () =>
      `sectionId=${cx.section._id}&subjectId=${cx.subject._id}&termId=${cx.term._id}`;
    const scoreOf = (body, admissionNo) =>
      body.students.find((s) => s.admissionNo === admissionNo).score;

    test('the grade report averages term results, not the baseline or mock interview', async () => {
      const res = await callC('get', `/academic/grades/report?${query()}`, 'tenant_admin');
      expect(res.status).toBe(200);
      expect(scoreOf(res.body, 'C-001')).toBe(70);
      expect(scoreOf(res.body, 'C-002')).toBe(60);
    });

    test('the school-wide summary does the same', async () => {
      const res = await callC(
        'get',
        `/academic/grades/summary?termId=${cx.term._id}`,
        'tenant_admin'
      );
      expect(res.status).toBe(200);
      expect(scoreOf(res.body, 'C-001')).toBe(70);
    });

    test('a baseline is still reported when it is asked for by name', async () => {
      const res = await callC(
        'get',
        `/academic/grades/report?${query()}&assessmentType=baseline`,
        'tenant_admin'
      );
      expect(scoreOf(res.body, 'C-001')).toBe(40);
    });
  });

  describe('GET /admin/training/outcomes', () => {
    beforeAll(async () => {
      // A student who has since graduated, still holding a completed enrolment, and
      // a student who completed two batches: neither may inflate the completion rate.
      const graduated = await Student.create({
        tenantId: C._id,
        admissionNo: 'C-004',
        firstName: 'Deepa',
        lastName: 'Rana',
        sectionId: cx.section._id,
        status: 'graduated',
      });
      await Enrollment.create({
        tenantId: C._id,
        studentId: graduated._id,
        sectionId: cx.section._id,
        status: 'completed',
      });
      await Enrollment.create({
        tenantId: C._id,
        studentId: cx.s1._id,
        sectionId: cx.otherSection._id,
        status: 'completed',
      });
    });

    const superAdmin = () =>
      signAccessToken({ sub: String(users.tenant_admin._id), systemRole: 'super_admin' });
    const outcomes = (token) =>
      request(app).get('/admin/training/outcomes').set('Authorization', `Bearer ${token}`);

    test('counts each student once and never reports more than 100% completion', async () => {
      const res = await outcomes(superAdmin());
      const college = res.body.colleges.find((c) => c.name === 'college-c');
      expect(college.completed).toBe(1); // s1 (twice) — not the graduated student
      expect(college.completionPct).toBeLessThanOrEqual(100);
      expect(college.completed).toBeLessThanOrEqual(college.enrolled);
    });

    test('is for the super admin only', async () => {
      expect((await outcomes(tokens.tenant_admin)).status).toBe(403);
      expect((await request(app).get('/admin/training/outcomes')).status).toBe(401);
    });

    test('reports per-college figures and nothing that identifies a person (V7)', async () => {
      const res = await outcomes(superAdmin());
      expect(res.status).toBe(200);
      const college = res.body.colleges.find((c) => c.name === 'college-c');
      expect(college).toMatchObject({
        enrolled: 3,
        completed: 1,
        dropped: 1,
        completionPct: 33.3,
        avgDelta: 20,
        studentsMeasured: 2,
        placement: { applied: 2, interviewed: 1, offered: 1, joined: 1, rejected: 0 },
      });
      // All-time, every student: present 4+5, absent 2 (s1, one outside the run) + 5 (s3).
      expect(college.attendancePct).toBe(56.3);

      const text = JSON.stringify(res.body);
      for (const forbidden of [
        'firstName',
        'lastName',
        'admissionNo',
        'Asha',
        'Bhavna',
        'Chetan',
        'Acme C',
        'phone',
        'email',
      ]) {
        expect(text).not.toContain(forbidden);
      }
    });

    test('colleges without the training module are left out', async () => {
      const res = await outcomes(superAdmin());
      const names = res.body.colleges.map((c) => c.name);
      expect(names).toEqual(expect.arrayContaining(['college-a', 'college-b', 'college-c']));
      expect(names).not.toContain('School');
      expect(names).not.toContain('Plain 2');
      expect(res.body.totals.colleges).toBe(res.body.colleges.length);
    });
  });
});
