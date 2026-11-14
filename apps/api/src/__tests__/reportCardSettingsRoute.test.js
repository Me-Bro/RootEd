// PATCH /tenant/settings (reportCard key) and the report card logo routes, through a
// mini Express app against an in-memory Mongo with Redis, Minio and the audit queue faked.
import { jest } from '@jest/globals';

const uploadBuffer = jest.fn(async () => {});
const removeObject = jest.fn(async () => {});
const auditLog = jest.fn().mockResolvedValue(undefined);

jest.unstable_mockModule('../services/audit.service.js', () => ({
  auditLog,
  processAuditLog: jest.fn(),
}));
jest.unstable_mockModule('../services/storage.service.js', () => ({
  uploadBuffer,
  removeObject,
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
const { TenantMembership } = await import('../models/TenantMembership.js');
const { default: tenantRouter } = await import('../routes/tenant.js');
const { signAccessToken, hashPassword } = await import('../services/auth.service.js');
const { errorHandler } = await import('../middleware/errorHandler.js');

let mongod;
let app;
const tenants = {};
const tokens = {};
let n = 0;

const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(64),
]);
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64)]);

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
  return { tenant, roles };
}

async function makeMember(tenant, role, label) {
  n += 1;
  const user = await User.create({
    email: `${label}${n}@rcard.test`,
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
  const a = await makeTenant('rcard-a');
  const b = await makeTenant('rcard-b');
  tenants.a = a.tenant;
  tenants.b = b.tenant;
  tokens.admin = await makeMember(a.tenant, a.roles.tenant_admin, 'admin');
  tokens.teacher = await makeMember(a.tenant, a.roles.teacher, 'teacher');
  tokens.adminB = await makeMember(b.tenant, b.roles.tenant_admin, 'adminb');

  app = express();
  app.use(express.json());
  app.use(async (req, _res, next) => {
    req.tenant = await Tenant.findById(tenants[req.headers['x-tenant'] ?? 'a']._id).lean();
    next();
  });
  app.use('/tenant', tenantRouter);
  app.use(errorHandler);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

beforeEach(() => {
  uploadBuffer.mockClear();
  removeObject.mockClear();
  auditLog.mockClear();
});

const patch = (who, body, tenant = 'a') => {
  const req = request(app).patch('/tenant/settings').set('x-tenant', tenant);
  if (who) req.set('Authorization', `Bearer ${tokens[who]}`);
  return req.send(body);
};

const upload = (who, buf, { type = 'image/png', name = 'logo.png', tenant = 'a' } = {}) => {
  const req = request(app).post('/tenant/report-card/logo').set('x-tenant', tenant);
  if (who) req.set('Authorization', `Bearer ${tokens[who]}`);
  return req.attach('logo', buf, { filename: name, contentType: type });
};

const remove = (who, tenant = 'a') => {
  const req = request(app).delete('/tenant/report-card/logo').set('x-tenant', tenant);
  if (who) req.set('Authorization', `Bearer ${tokens[who]}`);
  return req;
};

const saved = async (key) => (await Tenant.findById(tenants[key]._id).lean()).settings?.reportCard;

describe('PATCH /tenant/settings with reportCard', () => {
  test('writes each key, and saving one key keeps the others', async () => {
    const first = await patch('admin', {
      reportCard: { preset: 'modern', accentColor: '#1a5c1a', signatories: ['Principal'] },
    });
    expect(first.status).toBe(200);
    expect(first.body.settings.reportCard).toMatchObject({
      preset: 'modern',
      accentColor: '#1a5c1a',
      signatories: ['Principal'],
    });

    await patch('admin', { reportCard: { accentColor: '#112233' } });
    expect(await saved('a')).toMatchObject({
      preset: 'modern',
      accentColor: '#112233',
      signatories: ['Principal'],
    });
  });

  test('a report card save does not touch the other settings', async () => {
    const res = await patch('admin', { name: 'Renamed School', reportCard: { showRank: false } });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Renamed School');
    expect(res.body.settings.reportCard.showRank).toBe(false);
    expect(res.body.settings.reportCard.preset).toBe('modern');
  });

  test('only tenant:admin may save', async () => {
    const res = await patch('teacher', { reportCard: { preset: 'compact' } });
    expect(res.status).toBe(403);
    expect((await saved('a')).preset).toBe('modern');
  });

  test('an unauthenticated call is refused', async () => {
    expect((await patch(null, { reportCard: { preset: 'compact' } })).status).toBe(401);
  });

  test('bad values are rejected with 400 and nothing is saved', async () => {
    const before = await saved('a');
    for (const reportCard of [
      { accentColor: 'red' },
      { preset: 'fancy' },
      { signatories: [] },
      { schoolName: 'x'.repeat(81) },
      { unknown: 1 },
      { logoKey: 'branding/other/evil.png' },
    ]) {
      expect((await patch('admin', { reportCard })).status).toBe(400);
    }
    expect(await saved('a')).toEqual(before);
  });

  test('an empty schoolName is accepted and clears the override', async () => {
    await patch('admin', { reportCard: { schoolName: 'Green Valley' } });
    const res = await patch('admin', { reportCard: { schoolName: '' } });
    expect(res.status).toBe(200);
    expect((await saved('a')).schoolName).toBe('');
  });

  test('another tenant is unaffected', async () => {
    expect(await saved('b')).toBeUndefined();
  });
});

describe('POST /tenant/report-card/logo', () => {
  test('accepts a PNG, stores it under the tenant prefix and saves logoKey', async () => {
    const res = await upload('admin', PNG);
    expect(res.status).toBe(200);
    expect(uploadBuffer).toHaveBeenCalledTimes(1);
    const [key, buf, type] = uploadBuffer.mock.calls[0];
    expect(key).toMatch(new RegExp(`^branding/${tenants.a._id}/report-card-logo-\\d+\\.png$`));
    expect(buf.equals(PNG)).toBe(true);
    expect(type).toBe('image/png');
    expect((await saved('a')).logoKey).toBe(key);
    expect(res.body.logoKey).toBe(key);
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'report-card.logo_set',
        tenantId: tenants.a._id.toString(),
      })
    );
  });

  test('accepts a JPEG', async () => {
    const res = await upload('admin', JPEG, { type: 'image/jpeg', name: 'logo.jpg' });
    expect(res.status).toBe(200);
    expect(uploadBuffer.mock.calls[0][0]).toMatch(/\.jpg$/);
    expect(uploadBuffer.mock.calls[0][2]).toBe('image/jpeg');
  });

  test('replacing the logo removes the previous object', async () => {
    const before = (await saved('a')).logoKey;
    const res = await upload('admin', PNG);
    expect(res.status).toBe(200);
    expect(removeObject).toHaveBeenCalledWith(before);
    expect((await saved('a')).logoKey).not.toBe(before);
  });

  test('a failed cleanup of the old object does not fail the upload', async () => {
    removeObject.mockRejectedValueOnce(new Error('minio down'));
    expect((await upload('admin', PNG)).status).toBe(200);
  });

  test('rejects a file whose bytes are not a PNG or JPEG, whatever it claims to be', async () => {
    const before = (await saved('a')).logoKey;
    const html = Buffer.from('<script>alert(1)</script>');
    expect((await upload('admin', html, { type: 'image/png' })).status).toBe(400);
    const gif = Buffer.from('GIF89a' + 'x'.repeat(40));
    expect((await upload('admin', gif, { type: 'image/gif', name: 'a.gif' })).status).toBe(400);
    expect(uploadBuffer).not.toHaveBeenCalled();
    expect((await saved('a')).logoKey).toBe(before);
  });

  test('rejects a file over 500 KB', async () => {
    const big = Buffer.concat([PNG, Buffer.alloc(500 * 1024)]);
    const res = await upload('admin', big);
    expect(res.status).toBe(413);
    expect(uploadBuffer).not.toHaveBeenCalled();
  });

  test('rejects a request with no file', async () => {
    const res = await request(app)
      .post('/tenant/report-card/logo')
      .set('x-tenant', 'a')
      .set('Authorization', `Bearer ${tokens.admin}`);
    expect(res.status).toBe(400);
  });

  test('only tenant:admin may upload', async () => {
    expect((await upload('teacher', PNG)).status).toBe(403);
    expect((await upload(null, PNG)).status).toBe(401);
    expect(uploadBuffer).not.toHaveBeenCalled();
  });

  test('another tenant upload lands under its own prefix and leaves this tenant alone', async () => {
    const before = (await saved('a')).logoKey;
    const res = await upload('adminB', PNG, { tenant: 'b' });
    expect(res.status).toBe(200);
    expect(uploadBuffer.mock.calls[0][0]).toContain(`branding/${tenants.b._id}/`);
    expect((await saved('a')).logoKey).toBe(before);
    expect((await saved('b')).logoKey).toBe(uploadBuffer.mock.calls[0][0]);
    expect(removeObject).not.toHaveBeenCalled();
  });

  test('a logo upload keeps the other report card settings', async () => {
    expect((await saved('a')).preset).toBe('modern');
  });
});

describe('DELETE /tenant/report-card/logo', () => {
  test('clears logoKey and removes the object', async () => {
    const key = (await saved('a')).logoKey;
    const res = await remove('admin');
    expect(res.status).toBe(200);
    expect(removeObject).toHaveBeenCalledWith(key);
    expect((await saved('a')).logoKey).toBeUndefined();
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'report-card.logo_remove' })
    );
  });

  test('is a no-op when there is no logo', async () => {
    const res = await remove('admin');
    expect(res.status).toBe(200);
    expect(removeObject).not.toHaveBeenCalled();
  });

  test('only tenant:admin may remove', async () => {
    expect((await remove('teacher')).status).toBe(403);
  });
});
