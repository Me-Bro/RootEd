// A learner checks in and out by scanning the centre's QR code: POST /me/visits/scan,
// plus the owner-side token route and the settings leak guard.
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
const { Seat } = await import('../models/Seat.js');
const { Visit } = await import('../models/Visit.js');
const { TenantMembership } = await import('../models/TenantMembership.js');
const { default: meRouter } = await import('../routes/me.js');
const { default: tenantRouter } = await import('../routes/tenant.js');
const { signAccessToken, hashPassword } = await import('../services/auth.service.js');
const { errorHandler } = await import('../middleware/errorHandler.js');

const CENTRE = { lat: 28.6139, lng: 77.209 };
// 0.0001 degrees of latitude is about 11 m.
const at = (metres) => ({ lat: CENTRE.lat + metres / 111195, lng: CENTRE.lng, accuracy: 5 });

let mongod;
let app;
let tenant;
const tokens = {};
let n = 0;

async function makeMember(role, label) {
  n += 1;
  const user = await User.create({
    email: `${label}${n}@scan.test`,
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

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  await Visit.syncIndexes();

  tenant = await Tenant.create({
    name: 'scan-study',
    subdomain: 'scan-study',
    orgType: 'study_center',
    settings: { centre: { ...CENTRE, radiusM: 50, open24h: true, qrToken: 'a'.repeat(32) } },
  });
  const roles = {};
  for (const [key, permissions] of Object.entries(DEFAULT_ROLE_TEMPLATES)) {
    roles[key] = await Role.create({
      tenantId: tenant._id,
      name: key,
      templateKey: key,
      permissions,
    });
  }
  await Seat.create({ tenantId: tenant._id, label: 'A-1' });

  tokens.owner = (await makeMember(roles.tenant_admin, 'owner')).token;
  const learner = await makeMember(roles.student, 'learner');
  tokens.learner = learner.token;
  await Student.create({
    tenantId: tenant._id,
    admissionNo: 'S-1',
    firstName: 'Asha',
    lastName: 'Scan',
    userId: learner.user._id,
  });
  // A learner with no student record linked.
  tokens.orphan = (await makeMember(roles.student, 'orphan')).token;

  app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.tenant = tenant.toObject();
    next();
  });
  app.use('/me', meRouter);
  app.use('/tenant', tenantRouter);
  app.use(errorHandler);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

const scan = (body, who = 'learner') =>
  request(app)
    .post('/me/visits/scan')
    .set('Authorization', `Bearer ${tokens[who]}`)
    .send({ token: 'a'.repeat(32), ...at(0), ...body });

describe('POST /me/visits/scan', () => {
  test('inside the radius checks in on a seat, a second scan checks out', async () => {
    const inRes = await scan(at(30));
    expect(inRes.status).toBe(201);
    expect(inRes.body).toMatchObject({ action: 'check-in', seat: { label: 'A-1' } });
    expect(await Visit.countDocuments({ isOpen: true, method: 'qr' })).toBe(1);

    const outRes = await scan(at(30));
    expect(outRes.status).toBe(200);
    expect(outRes.body.action).toBe('check-out');
    expect(await Visit.countDocuments({ isOpen: true })).toBe(0);
    expect(auditLog).toHaveBeenCalledWith(expect.objectContaining({ action: 'visit.checkIn' }));
    expect(auditLog).toHaveBeenCalledWith(expect.objectContaining({ action: 'visit.checkOut' }));
  });

  test('too far away is refused and writes nothing', async () => {
    const res = await scan(at(300));
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/too far/i);
    expect(await Visit.countDocuments({})).toBe(1);
  });

  test('a vague location fix is refused', async () => {
    const res = await scan({ accuracy: 5000 });
    expect(res.status).toBe(422);
  });

  test('a wrong token is refused', async () => {
    const res = await scan({ token: 'b'.repeat(32) });
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/no longer valid/i);
  });

  test('staff without self:seat:write are refused', async () => {
    expect((await scan({}, 'owner')).status).toBe(403);
  });

  test('an account with no learner record gets 404', async () => {
    expect((await scan({}, 'orphan')).status).toBe(404);
  });

  test('refused when the centre has not set a location', async () => {
    const saved = tenant.settings.centre;
    tenant.settings = { centre: { qrToken: saved.qrToken } };
    const res = await scan({});
    tenant.settings = { centre: saved };
    expect(res.status).toBe(422);
  });
});

describe('centre QR token', () => {
  test('only the owner can create one, and it replaces the old one', async () => {
    const asLearner = await request(app)
      .post('/tenant/centre/qr')
      .set('Authorization', `Bearer ${tokens.learner}`);
    expect(asLearner.status).toBe(403);

    const res = await request(app)
      .post('/tenant/centre/qr')
      .set('Authorization', `Bearer ${tokens.owner}`);
    expect(res.status).toBe(200);
    expect(res.body.qrToken).toMatch(/^[0-9a-f]{32}$/);
    const stored = await Tenant.findById(tenant._id).lean();
    expect(stored.settings.centre.qrToken).toBe(res.body.qrToken);
  });

  test('GET /tenant/settings hides the token from a learner, shows it to the owner', async () => {
    const learner = await request(app)
      .get('/tenant/settings')
      .set('Authorization', `Bearer ${tokens.learner}`);
    expect(JSON.stringify(learner.body)).not.toMatch(/qrToken|centreQrToken/);

    const owner = await request(app)
      .get('/tenant/settings')
      .set('Authorization', `Bearer ${tokens.owner}`);
    expect(owner.body.centreQrToken).toMatch(/^[0-9a-f]{32}$/);
    expect(owner.body.settings.centre.qrToken).toBeUndefined();
  });
});
