// Walk-in registration and the student routes that learned about `phone` and
// `kind`, driven through a mini Express app against an in-memory Mongo. Redis
// and BullMQ are faked: the permission cache only needs get/setex/del, and the
// academic router builds a Queue at import time.
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
const { TenantMembership } = await import('../models/TenantMembership.js');
const { default: academicRouter } = await import('../routes/academic.js');
const { default: walkInRouter } = await import('../routes/walkins.js');
const { signAccessToken, hashPassword } = await import('../services/auth.service.js');
const { errorHandler } = await import('../middleware/errorHandler.js');

let mongod;
let app;
const tenants = {};
const tokens = {};
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

async function makeMember(tenant, role, label) {
  n += 1;
  const user = await User.create({
    email: `${label}${n}@study.test`,
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

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  await Student.syncIndexes();

  const study = await makeTenant('study-a', 'study_center');
  const study2 = await makeTenant('study-b', 'study_center');
  const tuition = await makeTenant('tuition-a', 'tuition_center');
  tenants.study = study.tenant;
  tenants.study2 = study2.tenant;
  tenants.tuition = tuition.tenant;

  tokens.desk = await makeMember(study.tenant, study.roles.front_desk, 'desk');
  tokens.admin = await makeMember(study.tenant, study.roles.tenant_admin, 'admin');
  tokens.teacher = await makeMember(study.tenant, study.roles.teacher, 'teacher');
  tokens.admin2 = await makeMember(study2.tenant, study2.roles.tenant_admin, 'admin2');
  tokens.desk2 = await makeMember(study2.tenant, study2.roles.front_desk, 'desk2');
  tokens.tuitionAdmin = await makeMember(tuition.tenant, tuition.roles.tenant_admin, 'tuition');

  app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.tenant = tenants[req.headers['x-tenant'] ?? 'study'];
    next();
  });
  app.use('/academic', academicRouter);
  app.use('/academic', walkInRouter);
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

const visitor = (phone, firstName = 'Asha') => ({ firstName, lastName: 'Rana', phone });

describe('POST /academic/walk-ins', () => {
  test('the front desk registers a walk-in with a generated admission number', async () => {
    const res = await call('post', '/academic/walk-ins', 'desk', visitor('+91 98765-43210'));
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ kind: 'walk_in', phone: '9876543210', status: 'active' });
    expect(res.body.admissionNo).toMatch(/^W-\d{8}-001$/);
    expect(res.body.sectionId).toBeUndefined();
    expect(auditLog).toHaveBeenCalledWith(expect.objectContaining({ action: 'walkIn.create' }));
  });

  test('the same phone typed another way returns the existing record with 409 (EH4)', async () => {
    const first = await call('post', '/academic/walk-ins', 'desk', visitor('9811111111', 'Ravi'));
    const again = await call('post', '/academic/walk-ins', 'desk', visitor('09811111111', 'Ravi'));
    expect(again.status).toBe(409);
    expect(again.body.existing._id).toBe(first.body._id);
    expect(await Student.countDocuments({ tenantId: tenants.study._id, phone: '9811111111' })).toBe(
      1
    );
  });

  test('different phones get different, unique admission numbers', async () => {
    const a = await call('post', '/academic/walk-ins', 'desk', visitor('9822222221'));
    const b = await call('post', '/academic/walk-ins', 'desk', visitor('9822222222'));
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    expect(a.body.admissionNo).not.toBe(b.body.admissionNo);
  });

  test('two desks registering the same number at once create exactly one record', async () => {
    const results = await Promise.all([
      call('post', '/academic/walk-ins', 'desk', visitor('9833333333')),
      call('post', '/academic/walk-ins', 'desk', visitor('9833333333')),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(await Student.countDocuments({ tenantId: tenants.study._id, phone: '9833333333' })).toBe(
      1
    );
  });

  test('a member sharing the phone does not block a walk-in', async () => {
    await Student.create({
      tenantId: tenants.study._id,
      admissionNo: 'M-001',
      firstName: 'Meena',
      lastName: 'Devi',
      phone: '9844444444',
    });
    const res = await call('post', '/academic/walk-ins', 'desk', visitor('9844444444'));
    expect(res.status).toBe(201);
  });

  test('rejects a missing name or a phone that is not a mobile number', async () => {
    expect((await call('post', '/academic/walk-ins', 'desk', visitor('12345'))).status).toBe(400);
    expect(
      (await call('post', '/academic/walk-ins', 'desk', { firstName: 'A', phone: '9855555555' }))
        .status
    ).toBe(400);
  });

  test('the client cannot choose kind or section', async () => {
    const res = await call('post', '/academic/walk-ins', 'desk', {
      ...visitor('9866666666'),
      kind: 'member',
    });
    expect(res.status).toBe(400);
  });

  test('a user without students:write is refused', async () => {
    const res = await call('post', '/academic/walk-ins', 'teacher', visitor('9877777777'));
    expect(res.status).toBe(403);
  });

  test('is not available to a non-study organization', async () => {
    const res = await call(
      'post',
      '/academic/walk-ins',
      'tuitionAdmin',
      visitor('9888888888'),
      'tuition'
    );
    expect(res.status).toBe(403);
  });

  test('is tenant-scoped: another study center can register the same number', async () => {
    await call('post', '/academic/walk-ins', 'desk', visitor('9899999999'));
    const other = await call(
      'post',
      '/academic/walk-ins',
      'desk2',
      visitor('9899999999'),
      'study2'
    );
    expect(other.status).toBe(201);
    expect(other.body.tenantId).toBe(String(tenants.study2._id));
  });
});

describe('POST /academic/walk-ins/:id/erase-contact', () => {
  test('only the owner can erase, and it clears the phone and the name but keeps the row', async () => {
    const made = await call('post', '/academic/walk-ins', 'desk', visitor('9700000001', 'Kiran'));
    const url = `/academic/walk-ins/${made.body._id}/erase-contact`;

    expect((await call('post', url, 'desk')).status).toBe(403);

    const res = await call('post', url, 'admin');
    expect(res.status).toBe(200);
    expect(res.body.phone).toBeUndefined();
    expect(res.body).toMatchObject({ firstName: 'Walk-in', lastName: 'Erased', kind: 'walk_in' });
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'walkIn.eraseContact' })
    );
  });

  test('refuses a member and another tenant’s walk-in', async () => {
    const member = await Student.create({
      tenantId: tenants.study._id,
      admissionNo: 'M-ERASE',
      firstName: 'Real',
      lastName: 'Member',
      phone: '9700000002',
    });
    expect(
      (await call('post', `/academic/walk-ins/${member._id}/erase-contact`, 'admin')).status
    ).toBe(404);

    const theirs = await call(
      'post',
      '/academic/walk-ins',
      'desk2',
      visitor('9700000003'),
      'study2'
    );
    expect(
      (await call('post', `/academic/walk-ins/${theirs.body._id}/erase-contact`, 'admin')).status
    ).toBe(404);
    expect((await Student.findById(member._id).lean()).phone).toBe('9700000002');
  });
});

describe('student list and edit in a study center', () => {
  test('hides walk-ins by default, shows them with kind=all, and keeps legacy rows without kind', async () => {
    const walkIn = await call(
      'post',
      '/academic/walk-ins',
      'desk',
      visitor('9600000001', 'Hidden')
    );
    // A row written before `kind` existed has no such field at all.
    await Student.collection.insertOne({
      tenantId: tenants.study._id,
      admissionNo: 'LEGACY-1',
      firstName: 'Old',
      lastName: 'Row',
      status: 'active',
    });

    const names = async (query) =>
      (await call('get', `/academic/students?limit=100${query}`, 'desk')).body.students.map(
        (s) => s.admissionNo
      );

    const byDefault = await names('');
    expect(byDefault).toContain('LEGACY-1');
    expect(byDefault).not.toContain(walkIn.body.admissionNo);

    expect(await names('&kind=all')).toContain(walkIn.body.admissionNo);
    expect(await names('&kind=walk_in')).toEqual(expect.arrayContaining([walkIn.body.admissionNo]));
    expect(await names('&kind=walk_in')).not.toContain('LEGACY-1');
  });

  test('finds a walk-in by phone however it is typed', async () => {
    const made = await call('post', '/academic/walk-ins', 'desk', visitor('9600000002'));
    const res = await call('get', '/academic/students?kind=all&phone=%2B91%2096000-00002', 'desk');
    expect(res.body.students.map((s) => s._id)).toEqual([made.body._id]);
  });

  test('a PATCH cannot turn a member into a walk-in', async () => {
    const member = await Student.create({
      tenantId: tenants.study._id,
      admissionNo: 'M-PATCH',
      firstName: 'Stay',
      lastName: 'Member',
    });
    const res = await call('patch', `/academic/students/${member._id}`, 'admin', {
      kind: 'walk_in',
      firstName: 'Still',
    });
    expect(res.status).toBe(200);
    const after = await Student.findById(member._id).lean();
    expect(after.kind).toBe('member');
    expect(after.firstName).toBe('Still');
  });

  test('a PATCH validates and normalizes the phone, and an empty phone clears it', async () => {
    const member = await Student.create({
      tenantId: tenants.study._id,
      admissionNo: 'M-PHONE',
      firstName: 'Ph',
      lastName: 'One',
    });
    const url = `/academic/students/${member._id}`;

    expect((await call('patch', url, 'admin', { phone: '12345' })).status).toBe(400);

    const ok = await call('patch', url, 'admin', { phone: '+91 91234-56789' });
    expect(ok.status).toBe(200);
    expect(ok.body.phone).toBe('9123456789');

    const cleared = await call('patch', url, 'admin', { phone: '' });
    expect(cleared.status).toBe(200);
    expect(cleared.body.phone).toBeUndefined();
  });

  test('creating a student stores a normalized phone and rejects a bad one', async () => {
    const ok = await call('post', '/academic/students', 'admin', {
      admissionNo: 'M-NEW',
      firstName: 'New',
      lastName: 'Member',
      phone: '098765 43211',
    });
    expect(ok.status).toBe(201);
    expect(ok.body.phone).toBe('9876543211');
    expect(ok.body.kind).toBe('member');

    const bad = await call('post', '/academic/students', 'admin', {
      admissionNo: 'M-BAD',
      firstName: 'Bad',
      lastName: 'Phone',
      phone: 'abc',
    });
    expect(bad.status).toBe(400);
  });
});
