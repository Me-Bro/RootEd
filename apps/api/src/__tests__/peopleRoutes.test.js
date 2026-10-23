// Drives the /tenant members routes and the student-login routes of /academic
// through a mini Express app against an in-memory Mongo and the real Redis the
// permission cache uses.
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
const { default: tenantRouter } = await import('../routes/tenant.js');
const { default: academicRouter } = await import('../routes/academic.js');
const { signAccessToken, hashPassword } = await import('../services/auth.service.js');
const { errorHandler } = await import('../middleware/errorHandler.js');
const { redis } = await import('../config/redis.js');

let mongod;
let app;
const tenants = {};
const roles = {};
const users = {};
const tokens = {};
const memberships = {};
let n = 0;

async function makeTenant(subdomain) {
  const tenant = await Tenant.create({ name: subdomain, subdomain, orgType: 'college' });
  const made = {};
  for (const [key, permissions] of Object.entries(DEFAULT_ROLE_TEMPLATES)) {
    made[key] = await Role.create({
      tenantId: tenant._id,
      name: key,
      templateKey: key,
      permissions,
    });
  }
  return { tenant, roles: made };
}

async function makeMember(tenant, role, label, status = 'active') {
  n += 1;
  const user = await User.create({
    email: `${label}${n}@college.test`,
    username: `${label}-${n}`,
    usernameLower: `${label}-${n}`,
    passwordHash: await hashPassword('irrelevant-but-valid'),
    emailVerified: true,
    status: 'active',
  });
  const membership = await TenantMembership.create({
    tenantId: tenant._id,
    userId: user._id,
    roleIds: [role._id],
    status,
  });
  return { user, membership, token: signAccessToken({ sub: user._id.toString() }) };
}

const newStudent = (tenant, no, first = 'Asha') =>
  Student.create({ tenantId: tenant._id, admissionNo: no, firstName: first, lastName: 'Rana' });

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  await Student.syncIndexes();

  const a = await makeTenant('college-a');
  const b = await makeTenant('college-b');
  tenants.A = a.tenant;
  tenants.B = b.tenant;
  roles.A = a.roles;
  roles.B = b.roles;

  for (const key of ['tenant_admin', 'principal', 'teacher']) {
    const m = await makeMember(a.tenant, a.roles[key], key);
    users[key] = m.user;
    tokens[key] = m.token;
    memberships[key] = m.membership;
  }
  const bAdmin = await makeMember(b.tenant, b.roles.tenant_admin, 'badmin');
  tokens.bAdmin = bAdmin.token;
  memberships.bAdmin = bAdmin.membership;

  app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.tenant = tenants[req.headers['x-tenant'] ?? 'A'];
    next();
  });
  app.use('/tenant', tenantRouter);
  app.use('/academic', academicRouter);
  app.use(errorHandler);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
  redis.disconnect();
});

const call = (method, path, who, body, tenant = 'A') => {
  const req = request(app)[method](path).set('x-tenant', tenant);
  if (who) req.set('Authorization', `Bearer ${tokens[who]}`);
  return body === undefined ? req : req.send(body);
};

describe('student logins', () => {
  test('gives a student with no login a claimable one, and the roster shows it', async () => {
    const student = await newStudent(tenants.A, 'L-001');
    const res = await call('post', `/academic/students/${student._id}/account`, 'tenant_admin', {
      email: 'Asha.L1@College.test',
    });
    expect(res.status).toBe(201);

    const linked = await Student.findById(student._id).lean();
    expect(linked.userId).toBeTruthy();
    const user = await User.findById(linked.userId).lean();
    expect(user.email).toBe('asha.l1@college.test');
    expect(user.status).toBe('pending_claim');
    const membership = await TenantMembership.findOne({
      tenantId: tenants.A._id,
      userId: user._id,
    }).lean();
    expect(membership.roleIds.map(String)).toEqual([String(roles.A.student._id)]);
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'student.account_created' })
    );

    const list = await call('get', '/academic/students?limit=100', 'tenant_admin');
    const row = list.body.students.find((s) => s.admissionNo === 'L-001');
    expect(row.account).toMatchObject({ email: 'asha.l1@college.test', status: 'pending_claim' });
  });

  test('a second login for the same student is refused', async () => {
    const student = await newStudent(tenants.A, 'L-002');
    const url = `/academic/students/${student._id}/account`;
    await call('post', url, 'tenant_admin', { email: 'l2@college.test' });
    const again = await call('post', url, 'tenant_admin', { email: 'other-l2@college.test' });
    expect(again.status).toBe(409);
  });

  test('an address already linked to another student is refused', async () => {
    const one = await newStudent(tenants.A, 'L-003');
    const two = await newStudent(tenants.A, 'L-004');
    await call('post', `/academic/students/${one._id}/account`, 'tenant_admin', {
      email: 'shared@college.test',
    });
    const res = await call('post', `/academic/students/${two._id}/account`, 'tenant_admin', {
      email: 'shared@college.test',
    });
    expect(res.status).toBe(409);
    expect((await Student.findById(two._id).lean()).userId).toBeUndefined();
  });

  test('a suspended person cannot be given a login around the suspension', async () => {
    const sus = await makeMember(tenants.A, roles.A.librarian, 'sus', 'suspended');
    const student = await newStudent(tenants.A, 'L-005');
    const res = await call('post', `/academic/students/${student._id}/account`, 'tenant_admin', {
      email: sus.user.email,
    });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/suspended/);
  });

  test('only students:write may give a login; a teacher cannot, and sees no logins', async () => {
    const student = await newStudent(tenants.A, 'L-006');
    const url = `/academic/students/${student._id}/account`;
    expect((await call('post', url, 'teacher', { email: 'l6@college.test' })).status).toBe(403);
    expect((await call('post', url, 'principal', { email: 'l6@college.test' })).status).toBe(403);

    const list = await call('get', '/academic/students?limit=100', 'teacher');
    expect(list.status).toBe(200);
    expect(list.body.students.every((s) => !('account' in s))).toBe(true);
  });

  test('a student of another college is 404', async () => {
    const student = await newStudent(tenants.B, 'B-001');
    const res = await call('post', `/academic/students/${student._id}/account`, 'tenant_admin', {
      email: 'b1@college.test',
    });
    expect(res.status).toBe(404);
  });

  test('rejects a missing or malformed email', async () => {
    const student = await newStudent(tenants.A, 'L-007');
    const url = `/academic/students/${student._id}/account`;
    expect((await call('post', url, 'tenant_admin', {})).status).toBe(400);
    expect((await call('post', url, 'tenant_admin', { email: 'nope' })).status).toBe(400);
  });

  test('resend issues a new link only to someone who has not claimed yet', async () => {
    const student = await newStudent(tenants.A, 'L-008');
    await call('post', `/academic/students/${student._id}/account`, 'tenant_admin', {
      email: 'l8@college.test',
    });
    const userId = (await Student.findById(student._id).lean()).userId;
    const before = (await User.findById(userId).select('+passwordResetToken').lean())
      .passwordResetToken;

    const url = `/academic/students/${student._id}/account/resend`;
    expect((await call('post', url, 'tenant_admin')).status).toBe(200);
    const after = (await User.findById(userId).select('+passwordResetToken').lean())
      .passwordResetToken;
    expect(after).not.toBe(before);

    await User.updateOne({ _id: userId }, { $set: { status: 'active' } });
    expect((await call('post', url, 'tenant_admin')).status).toBe(409);
  });

  test('resend for a student with no login is 409', async () => {
    const student = await newStudent(tenants.A, 'L-009');
    const res = await call(
      'post',
      `/academic/students/${student._id}/account/resend`,
      'tenant_admin'
    );
    expect(res.status).toBe(409);
  });
});

describe('adding staff', () => {
  const body = (extra = {}) => ({
    email: 'mentor@college.test',
    firstName: 'Meera',
    lastName: 'Nair',
    roleIds: [String(roles.A.teacher._id)],
    ...extra,
  });

  test('adds a mentor with a claimable login and the chosen role', async () => {
    const res = await call('post', '/tenant/members', 'tenant_admin', body());
    expect(res.status).toBe(201);
    const user = await User.findOne({ email: 'mentor@college.test' }).lean();
    expect(user.status).toBe('pending_claim');
    const m = await TenantMembership.findOne({ tenantId: tenants.A._id, userId: user._id }).lean();
    expect(m.roleIds.map(String)).toEqual([String(roles.A.teacher._id)]);
    expect(m.status).toBe('active');
    expect(auditLog).toHaveBeenCalledWith(expect.objectContaining({ action: 'member.added' }));
  });

  test('adding the same person twice is refused', async () => {
    const res = await call('post', '/tenant/members', 'tenant_admin', body());
    expect(res.status).toBe(409);
  });

  test('a role of another college is refused', async () => {
    const res = await call(
      'post',
      '/tenant/members',
      'tenant_admin',
      body({ email: 'x@college.test', roleIds: [String(roles.B.teacher._id)] })
    );
    expect(res.status).toBe(400);
  });

  test('only roles:write may add; the principal cannot', async () => {
    expect((await call('post', '/tenant/members', 'principal', body())).status).toBe(403);
    expect((await call('post', '/tenant/members', 'teacher', body())).status).toBe(403);
  });

  test('rejects a missing name or role', async () => {
    expect(
      (await call('post', '/tenant/members', 'tenant_admin', body({ firstName: '' }))).status
    ).toBe(400);
    expect(
      (await call('post', '/tenant/members', 'tenant_admin', body({ roleIds: [] }))).status
    ).toBe(400);
  });

  test('resend for a staff member who set a password is 409', async () => {
    const m = await makeMember(tenants.A, roles.A.teacher, 'claimed');
    const res = await call(
      'post',
      `/tenant/members/${m.membership._id}/resend-claim`,
      'tenant_admin'
    );
    expect(res.status).toBe(409);
  });

  test('resend works for a pending member', async () => {
    const user = await User.findOne({ email: 'mentor@college.test' }).lean();
    const m = await TenantMembership.findOne({ tenantId: tenants.A._id, userId: user._id }).lean();
    const res = await call('post', `/tenant/members/${m._id}/resend-claim`, 'tenant_admin');
    expect(res.status).toBe(200);
  });
});

describe('members list audiences', () => {
  test('staff excludes student-only memberships and students shows only them', async () => {
    const stu = await makeMember(tenants.A, roles.A.student, 'stud');
    const staff = await call('get', '/tenant/members?audience=staff&limit=100', 'tenant_admin');
    const students = await call(
      'get',
      '/tenant/members?audience=students&limit=100',
      'tenant_admin'
    );
    const ids = (r) => r.body.members.map((m) => String(m._id));
    expect(ids(staff)).not.toContain(String(stu.membership._id));
    expect(ids(students)).toContain(String(stu.membership._id));
    expect(ids(students)).not.toContain(String(memberships.tenant_admin._id));
    expect(ids(staff)).toContain(String(memberships.tenant_admin._id));
    expect(staff.body.members[0].userId).toHaveProperty('status');
  });
});

describe('suspending and reactivating', () => {
  test('suspends, locks the person out at once, and reactivates', async () => {
    const m = await makeMember(tenants.A, roles.A.teacher, 'susp');
    // warm the permission cache so we prove it is dropped
    expect((await call('get', '/tenant/roles', 'tenant_admin')).status).toBe(200);

    const url = `/tenant/members/${m.membership._id}/status`;
    const off = await call('patch', url, 'tenant_admin', { status: 'suspended' });
    expect(off.status).toBe(200);
    expect(off.body.status).toBe('suspended');
    expect(auditLog).toHaveBeenCalledWith(expect.objectContaining({ action: 'member.suspended' }));

    // the suspended teacher has no permissions now: 403 where it was 200 for attendance reads
    const res = await request(app)
      .get('/academic/students')
      .set('x-tenant', 'A')
      .set('Authorization', `Bearer ${m.token}`);
    expect(res.status).toBe(403);

    const on = await call('patch', url, 'tenant_admin', { status: 'active' });
    expect(on.body.status).toBe('active');
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'member.reactivated' })
    );
  });

  test('you cannot suspend yourself, nor the last administrator', async () => {
    const adminUrl = `/tenant/members/${memberships.tenant_admin._id}/status`;
    const self = await call('patch', adminUrl, 'tenant_admin', { status: 'suspended' });
    expect(self.status).toBe(400);

    // Someone with roles:write who is not an administrator, acting on the only admin.
    const hrRole = await Role.create({
      tenantId: tenants.A._id,
      name: 'hr',
      permissions: ['roles:read', 'roles:write'],
    });
    const hr = await makeMember(tenants.A, hrRole, 'hr');
    tokens.hr = hr.token;
    const last = await call('patch', adminUrl, 'hr', { status: 'suspended' });
    expect(last.status).toBe(409);
    expect((await TenantMembership.findById(memberships.tenant_admin._id).lean()).status).toBe(
      'active'
    );
  });

  test('another college cannot touch this member (404) and an unknown status is 400', async () => {
    const m = await makeMember(tenants.A, roles.A.teacher, 'iso');
    const url = `/tenant/members/${m.membership._id}/status`;
    expect((await call('patch', url, 'bAdmin', { status: 'suspended' }, 'B')).status).toBe(404);
    expect((await call('patch', url, 'tenant_admin', { status: 'pending' })).status).toBe(400);
  });

  test('the principal cannot suspend', async () => {
    const m = await makeMember(tenants.A, roles.A.teacher, 'nope');
    const res = await call('patch', `/tenant/members/${m.membership._id}/status`, 'principal', {
      status: 'suspended',
    });
    expect(res.status).toBe(403);
  });
});
