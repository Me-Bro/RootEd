// TICKET-009: a study center records presence as check-in and check-out, so the
// roll-call attendance write is refused there and unchanged everywhere else.
import { jest } from '@jest/globals';

jest.unstable_mockModule('../services/audit.service.js', () => ({
  auditLog: jest.fn().mockResolvedValue(undefined),
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
const { AttendanceRecord } = await import('../models/AttendanceRecord.js');
const { TenantMembership } = await import('../models/TenantMembership.js');
const { default: academicRouter } = await import('../routes/academic.js');
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
    email: `${label}${n}@roll.test`,
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
  await AttendanceRecord.syncIndexes();

  const study = await makeTenant('roll-study', 'study_center');
  const school = await makeTenant('roll-school', 'school');
  const tuition = await makeTenant('roll-tuition', 'tuition_center');
  tenants.study = study.tenant;
  tenants.school = school.tenant;
  tenants.tuition = tuition.tenant;

  tokens.studyOwner = await makeMember(study.tenant, study.roles.tenant_admin, 'sowner');
  tokens.studyDesk = await makeMember(study.tenant, study.roles.front_desk, 'sdesk');
  tokens.schoolTeacher = await makeMember(school.tenant, school.roles.teacher, 'steacher');
  tokens.tuitionTeacher = await makeMember(tuition.tenant, tuition.roles.teacher, 'ttutor');

  app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.tenant = tenants[req.headers['x-tenant']];
    next();
  });
  app.use('/academic', academicRouter);
  app.use(errorHandler);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

const rollCall = () => ({
  date: '2026-05-11',
  sectionId: new mongoose.Types.ObjectId().toString(),
  records: [{ entityId: new mongoose.Types.ObjectId().toString(), status: 'present' }],
});

const mark = (tenant, who) =>
  request(app)
    .post('/academic/attendance')
    .set('x-tenant', tenant)
    .set('Authorization', `Bearer ${tokens[who]}`)
    .send(rollCall());

describe('POST /academic/attendance', () => {
  test('is refused at a study center, for the owner and the front desk alike, and writes nothing', async () => {
    for (const who of ['studyOwner', 'studyDesk']) {
      const res = await mark('study', who);
      expect(res.status).toBe(422);
      expect(res.body.error).toMatch(/check-in and check-out/);
    }
    expect(await AttendanceRecord.countDocuments({ tenantId: tenants.study._id })).toBe(0);
  });

  test('still saves for a school and for a tuition center', async () => {
    for (const [tenant, who] of [
      ['school', 'schoolTeacher'],
      ['tuition', 'tuitionTeacher'],
    ]) {
      const res = await mark(tenant, who);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ saved: 1 });
      expect(await AttendanceRecord.countDocuments({ tenantId: tenants[tenant]._id })).toBe(1);
    }
  });

  test('a study center still answers the reads, so old records stay readable by URL', async () => {
    const res = await request(app)
      .get('/academic/attendance?date=2026-05-11')
      .set('x-tenant', 'study')
      .set('Authorization', `Bearer ${tokens.studyOwner}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});
