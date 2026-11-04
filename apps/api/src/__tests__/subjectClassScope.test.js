// A subject's class must belong to the same tenant. Drives POST/PATCH
// /academic/subjects through a mini Express app against an in-memory Mongo and
// the real Redis the permission cache uses.
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
const { Class } = await import('../models/Class.js');
const { Subject } = await import('../models/Subject.js');
const { TenantMembership } = await import('../models/TenantMembership.js');
const { default: academicRouter } = await import('../routes/academic.js');
const { signAccessToken, hashPassword } = await import('../services/auth.service.js');
const { errorHandler } = await import('../middleware/errorHandler.js');
const { redis } = await import('../config/redis.js');

let mongod;
let app;
const tenants = {};
const classes = {};
const tokens = {};
let n = 0;

async function makeTenant(subdomain) {
  const tenant = await Tenant.create({ name: subdomain, subdomain, orgType: 'school' });
  const roles = {};
  for (const [key, permissions] of Object.entries(DEFAULT_ROLE_TEMPLATES)) {
    roles[key] = await Role.create({
      tenantId: tenant._id,
      name: key,
      templateKey: key,
      permissions,
    });
  }
  const klass = await Class.create({ tenantId: tenant._id, name: `Grade 5 ${subdomain}` });
  n += 1;
  const user = await User.create({
    email: `admin${n}@school.test`,
    username: `admin-${n}`,
    usernameLower: `admin-${n}`,
    passwordHash: await hashPassword('irrelevant-but-valid'),
    emailVerified: true,
    status: 'active',
  });
  await TenantMembership.create({
    tenantId: tenant._id,
    userId: user._id,
    roleIds: [roles.tenant_admin._id],
    status: 'active',
  });
  return { tenant, klass, token: signAccessToken({ sub: user._id.toString() }) };
}

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  for (const key of ['a', 'b']) {
    const made = await makeTenant(`school-${key}`);
    tenants[key] = made.tenant;
    classes[key] = made.klass;
    tokens[key] = made.token;
  }
  app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.tenant = tenants[req.headers['x-tenant'] ?? 'a'];
    next();
  });
  app.use('/academic', academicRouter);
  app.use(errorHandler);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
  redis.disconnect();
});

const call = (method, path, body) => {
  const req = request(app)[method](path);
  req.set('x-tenant', 'a').set('Authorization', `Bearer ${tokens.a}`);
  return req.send(body);
};

describe('subject class belongs to the tenant', () => {
  test('a class of this tenant is accepted on create, and so is no class at all', async () => {
    const withClass = await call('post', '/academic/subjects', {
      name: 'Maths',
      code: 'M1',
      classId: String(classes.a._id),
    });
    expect(withClass.status).toBe(201);
    expect(String(withClass.body.classId)).toBe(String(classes.a._id));
    const without = await call('post', '/academic/subjects', { name: 'Art', code: 'A1' });
    expect(without.status).toBe(201);
  });

  test("another tenant's class is refused on create, and nothing is stored", async () => {
    const res = await call('post', '/academic/subjects', {
      name: 'Foreign',
      code: 'F1',
      classId: String(classes.b._id),
    });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Class not found');
    expect(await Subject.countDocuments({ tenantId: tenants.a._id, code: 'F1' })).toBe(0);
  });

  test("another tenant's class is refused on update, and the subject is unchanged", async () => {
    const s = await Subject.create({
      tenantId: tenants.a._id,
      name: 'Science',
      code: 'S1',
      classId: classes.a._id,
    });
    const res = await call('patch', `/academic/subjects/${s._id}`, {
      classId: String(classes.b._id),
    });
    expect(res.status).toBe(404);
    expect(String((await Subject.findById(s._id).lean()).classId)).toBe(String(classes.a._id));
  });

  test('an update that does not touch the class still works, and so does moving to a class of this tenant', async () => {
    const other = await Class.create({ tenantId: tenants.a._id, name: 'Grade 6' });
    const s = await Subject.create({ tenantId: tenants.a._id, name: 'Hindi', code: 'H1' });
    expect((await call('patch', `/academic/subjects/${s._id}`, { name: 'Hindi II' })).status).toBe(
      200
    );
    const moved = await call('patch', `/academic/subjects/${s._id}`, {
      classId: String(other._id),
    });
    expect(moved.status).toBe(200);
    expect(String(moved.body.classId)).toBe(String(other._id));
  });
});
