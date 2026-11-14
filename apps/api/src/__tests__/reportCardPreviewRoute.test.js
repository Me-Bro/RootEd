// POST /academic/report-card/preview through a mini Express app against an in-memory
// Mongo, with Redis, Minio, the audit queue and BullMQ faked.
import { jest } from '@jest/globals';

const queueAdd = jest.fn();
const getObjectBuffer = jest.fn(async () => null);
const auditLog = jest.fn().mockResolvedValue(undefined);

jest.unstable_mockModule('../services/audit.service.js', () => ({
  auditLog,
  processAuditLog: jest.fn(),
}));
jest.unstable_mockModule('../services/storage.service.js', () => ({
  uploadBuffer: jest.fn(async () => {}),
  removeObject: jest.fn(async () => {}),
  getObjectBuffer,
  getSignedUrl: jest.fn(async () => 'http://signed'),
  ensureBucket: jest.fn(async () => {}),
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
    add(...args) {
      return queueAdd(...args);
    }
    getJobs() {
      return [];
    }
    on() {}
    close() {}
  },
  Worker: class {},
}));

const { MongoMemoryServer } = await import('mongodb-memory-server');
const { default: mongoose } = await import('mongoose');
const { default: express } = await import('express');
const { default: request } = await import('supertest');
const { default: PDFDocument } = await import('pdfkit');
const { Tenant } = await import('../models/Tenant.js');
const { Role, DEFAULT_ROLE_TEMPLATES } = await import('../models/Role.js');
const { User } = await import('../models/User.js');
const { Student } = await import('../models/Student.js');
const { Class } = await import('../models/Class.js');
const { Section } = await import('../models/Section.js');
const { ReportCardBatch } = await import('../models/ReportCardBatch.js');
const { TenantMembership } = await import('../models/TenantMembership.js');
const { default: academicRouter } = await import('../routes/academic.js');
const { signAccessToken, hashPassword } = await import('../services/auth.service.js');
const { errorHandler } = await import('../middleware/errorHandler.js');

let mongod;
let app;
const tenants = {};
const sections = {};
const tokens = {};
let n = 0;

const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64'
);

async function makeTenant(subdomain) {
  const tenant = await Tenant.create({ name: `${subdomain} School`, subdomain, orgType: 'school' });
  const roles = {};
  for (const [key, permissions] of Object.entries(DEFAULT_ROLE_TEMPLATES)) {
    roles[key] = await Role.create({
      tenantId: tenant._id,
      name: key,
      templateKey: key,
      permissions,
    });
  }
  const klass = await Class.create({ tenantId: tenant._id, name: 'Grade 7' });
  const section = await Section.create({ tenantId: tenant._id, classId: klass._id, name: 'B' });
  return { tenant, roles, section };
}

async function makeMember(tenant, role, label) {
  n += 1;
  const user = await User.create({
    email: `${label}${n}@preview.test`,
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
  const a = await makeTenant('prev-a');
  const b = await makeTenant('prev-b');
  tenants.a = a.tenant;
  tenants.b = b.tenant;
  sections.a = a.section;
  sections.b = b.section;
  tokens.admin = await makeMember(a.tenant, a.roles.tenant_admin, 'admin');
  tokens.librarian = await makeMember(a.tenant, a.roles.librarian, 'lib');

  await Student.create({
    tenantId: a.tenant._id,
    sectionId: a.section._id,
    admissionNo: 'P-002',
    firstName: 'Zoya',
    lastName: 'Khan',
    status: 'active',
  });
  await Student.create({
    tenantId: a.tenant._id,
    sectionId: a.section._id,
    admissionNo: 'P-001',
    firstName: 'Meera',
    lastName: 'Iyer',
    status: 'active',
  });
  await Student.create({
    tenantId: a.tenant._id,
    sectionId: a.section._id,
    admissionNo: 'P-000',
    firstName: 'Gone',
    lastName: 'Away',
    status: 'withdrawn',
  });
  await Student.create({
    tenantId: b.tenant._id,
    sectionId: b.section._id,
    admissionNo: 'B-001',
    firstName: 'Other',
    lastName: 'Tenant',
    status: 'active',
  });

  app = express();
  app.use(express.json());
  app.use(async (req, _res, next) => {
    req.tenant = await Tenant.findById(tenants[req.headers['x-tenant'] ?? 'a']._id).lean();
    next();
  });
  app.use('/academic', academicRouter);
  app.use(errorHandler);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

let textSpy;
beforeEach(() => {
  textSpy = jest.spyOn(PDFDocument.prototype, 'text');
  queueAdd.mockClear();
  getObjectBuffer.mockReset();
  getObjectBuffer.mockResolvedValue(null);
  auditLog.mockClear();
});
afterEach(() => jest.restoreAllMocks());

const texts = () => textSpy.mock.calls.map((c) => String(c[0]));
const pageCount = (buf) => (buf.toString('latin1').match(/\/Type \/Page(?![s\w])/g) ?? []).length;

const binary = (res, cb) => {
  const chunks = [];
  res.on('data', (c) => chunks.push(c));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
};

const preview = (who, body = {}, tenant = 'a') => {
  const req = request(app)
    .post('/academic/report-card/preview')
    .set('x-tenant', tenant)
    .buffer(true)
    .parse(binary);
  if (who) req.set('Authorization', `Bearer ${tokens[who]}`);
  return req.send(body);
};

const json = (res) => JSON.parse(res.body.toString());

const setSaved = (reportCard) =>
  Tenant.updateOne({ _id: tenants.a._id }, { $set: { 'settings.reportCard': reportCard } });

describe('POST /academic/report-card/preview', () => {
  test('returns a one-page PDF with sample data and no body', async () => {
    const res = await preview('admin');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/pdf/);
    expect(res.body.subarray(0, 4).toString()).toBe('%PDF');
    expect(pageCount(res.body)).toBe(1);
    expect(texts()).toContain('prev-a School');
  });

  test('uses the saved settings when there is no draft', async () => {
    await setSaved({ preset: 'compact', schoolName: 'Saved Name' });
    await preview('admin');
    expect(texts()).toContain('Saved Name');
    expect(texts().some((t) => t.startsWith('Average: '))).toBe(true);
    await setSaved({});
  });

  test('a draft is laid over the saved settings, key by key', async () => {
    await setSaved({ preset: 'compact', schoolName: 'Saved Name', subtitle: 'Saved subtitle' });
    await preview('admin', { config: { schoolName: 'Draft Name' } });
    expect(texts()).toContain('Draft Name');
    expect(texts()).toContain('Saved subtitle');
    expect(texts().some((t) => t.startsWith('Average: '))).toBe(true);
    await setSaved({});
  });

  test('the draft is not saved, and nothing is queued or recorded', async () => {
    await preview('admin', { config: { preset: 'modern', schoolName: 'Never Saved' } });
    const tenant = await Tenant.findById(tenants.a._id).lean();
    expect(tenant.settings?.reportCard?.schoolName).toBeUndefined();
    expect(queueAdd).not.toHaveBeenCalled();
    expect(await ReportCardBatch.countDocuments({ tenantId: tenants.a._id })).toBe(0);
    expect(auditLog).not.toHaveBeenCalled();
  });

  test('with a section it borrows the first active student by admission number', async () => {
    const res = await preview('admin', { sectionId: sections.a._id.toString() });
    expect(res.status).toBe(200);
    expect(texts()).toContain('Meera Iyer');
    expect(texts()).toContain('Admission No: P-001');
    expect(texts()).toContain('Grade 7 - B  ·  Preview');
    expect(texts().join('|')).not.toContain('Gone Away');
  });

  test('a section with no active students falls back to the sample student', async () => {
    const klass = await Class.create({ tenantId: tenants.a._id, name: 'Grade 1' });
    const empty = await Section.create({ tenantId: tenants.a._id, classId: klass._id, name: 'Z' });
    const res = await preview('admin', { sectionId: empty._id.toString() });
    expect(res.status).toBe(200);
    expect(texts()).toContain('Sample Student');
  });

  test("another tenant's section is a 404", async () => {
    const res = await preview('admin', { sectionId: sections.b._id.toString() });
    expect(res.status).toBe(404);
  });

  test('a section that does not exist is a 404', async () => {
    const res = await preview('admin', { sectionId: new mongoose.Types.ObjectId().toString() });
    expect(res.status).toBe(404);
  });

  test('a bad draft is a 400', async () => {
    for (const body of [
      { config: { accentColor: 'red' } },
      { config: { preset: 'fancy' } },
      { config: { logoKey: 'branding/x/y.png' } },
      { sectionId: 'nope' },
      { unknown: true },
    ]) {
      const res = await preview('admin', body);
      expect(res.status).toBe(400);
      expect(json(res).error).toBe('Validation error');
    }
  });

  test('draws the saved logo, and a failing download still returns the card', async () => {
    await setSaved({ logoKey: `branding/${tenants.a._id}/report-card-logo-1.png` });
    const imageSpy = jest.spyOn(PDFDocument.prototype, 'image');

    getObjectBuffer.mockResolvedValue(PNG_1X1);
    expect((await preview('admin')).status).toBe(200);
    expect(getObjectBuffer).toHaveBeenCalledWith(
      `branding/${tenants.a._id}/report-card-logo-1.png`
    );
    expect(imageSpy).toHaveBeenCalledTimes(1);

    imageSpy.mockClear();
    getObjectBuffer.mockRejectedValue(new Error('minio down'));
    const res = await preview('admin');
    expect(res.status).toBe(200);
    expect(imageSpy).not.toHaveBeenCalled();
    await setSaved({});
  });

  test('needs grades:publish', async () => {
    expect((await preview('librarian')).status).toBe(403);
    expect((await preview(null)).status).toBe(401);
  });

  test('is rate limited', async () => {
    const res = await preview('admin');
    expect(res.headers['ratelimit-limit']).toBeDefined();
  });
});
