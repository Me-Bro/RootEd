// Drives POST /tenant/archive (an org admin closing their own org) through a mini
// Express app against an in-memory Mongo and the real Redis the permission cache uses.
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
const { default: tenantRouter } = await import('../routes/tenant.js');
const { signAccessToken, hashPassword } = await import('../services/auth.service.js');
const { errorHandler } = await import('../middleware/errorHandler.js');
const { redis } = await import('../config/redis.js');

let mongod;
let app;
let tenant;
const tokens = {};
let n = 0;

async function makeMember(roleDoc, label) {
  n += 1;
  const user = await User.create({
    email: `${label}${n}@archive.test`,
    username: `${label}-${n}`,
    usernameLower: `${label}-${n}`,
    passwordHash: await hashPassword('irrelevant-but-valid'),
    emailVerified: true,
    status: 'active',
  });
  await TenantMembership.create({
    tenantId: tenant._id,
    userId: user._id,
    roleIds: [roleDoc._id],
    status: 'active',
  });
  return signAccessToken({ sub: user._id.toString() });
}

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());

  tenant = await Tenant.create({
    name: 'Archive College',
    subdomain: 'archive',
    orgType: 'college',
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
  tokens.admin = await makeMember(roles.tenant_admin, 'admin');
  tokens.principal = await makeMember(roles.principal, 'principal');

  app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.tenant = tenant;
    next();
  });
  app.use('/tenant', tenantRouter);
  app.use(errorHandler);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
  redis.disconnect();
});

beforeEach(async () => {
  auditLog.mockClear();
  await Tenant.updateOne({ _id: tenant._id }, { status: 'active', archivedAt: null });
});

const archive = (who, body) => {
  const req = request(app).post('/tenant/archive');
  if (who) req.set('Authorization', `Bearer ${tokens[who]}`);
  return req.send(body);
};

describe('POST /tenant/archive', () => {
  test('rejects an unauthenticated caller', async () => {
    const res = await archive(null, { confirmName: 'Archive College' });
    expect(res.status).toBe(401);
  });

  test('rejects a member without tenant:admin and leaves the org active', async () => {
    const res = await archive('principal', { confirmName: 'Archive College' });
    expect(res.status).toBe(403);
    expect((await Tenant.findById(tenant._id)).status).toBe('active');
  });

  test('rejects a missing or wrong confirmation name', async () => {
    expect((await archive('admin', {})).status).toBe(400);
    const wrong = await archive('admin', { confirmName: 'Other College' });
    expect(wrong.status).toBe(400);
    expect((await Tenant.findById(tenant._id)).status).toBe('active');
  });

  test('archives the org, sets the retention window and audits it', async () => {
    const res = await archive('admin', { confirmName: '  Archive College ' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('archived');

    const saved = await Tenant.findById(tenant._id);
    expect(saved.status).toBe('archived');
    expect(saved.archivedAt).toBeInstanceOf(Date);
    const days = (saved.dataRetentionUntil - saved.archivedAt) / 86_400_000;
    expect(Math.round(days)).toBe(90);

    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'tenant.archived', tenantId: tenant._id.toString() })
    );
  });
});
