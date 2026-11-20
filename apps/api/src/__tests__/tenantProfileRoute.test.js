// GET/PATCH /tenant/settings (profile, orgCode) and the org logo routes, through a mini
// Express app against an in-memory Mongo with Redis, Minio and the audit queue faked.
import { jest } from '@jest/globals';

const uploadBuffer = jest.fn(async () => {});
const removeObject = jest.fn(async () => {});
const getSignedUrl = jest.fn(async () => 'http://signed/logo');
const auditLog = jest.fn().mockResolvedValue(undefined);

jest.unstable_mockModule('../services/audit.service.js', () => ({
  auditLog,
  processAuditLog: jest.fn(),
}));
jest.unstable_mockModule('../services/storage.service.js', () => ({
  uploadBuffer,
  removeObject,
  getSignedUrl,
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
const { allocateOrgCode } = await import('../services/orgCode.service.js');
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

async function makeTenant(subdomain, { withCode = true } = {}) {
  const tenant = await Tenant.create({
    name: subdomain,
    subdomain,
    orgType: 'school',
    ...(withCode ? { orgCode: await allocateOrgCode() } : {}),
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
  return { tenant, roles };
}

async function makeMember(tenant, role, label) {
  n += 1;
  const user = await User.create({
    email: `${label}${n}@profile.test`,
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
  await Tenant.syncIndexes();
  const a = await makeTenant('prof-a');
  const b = await makeTenant('prof-b');
  const c = await makeTenant('prof-c', { withCode: false });
  tenants.a = a.tenant;
  tenants.b = b.tenant;
  tenants.c = c.tenant;
  tokens.admin = await makeMember(a.tenant, a.roles.tenant_admin, 'admin');
  tokens.teacher = await makeMember(a.tenant, a.roles.teacher, 'teacher');
  tokens.adminB = await makeMember(b.tenant, b.roles.tenant_admin, 'adminb');
  tokens.adminC = await makeMember(c.tenant, c.roles.tenant_admin, 'adminc');

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
  getSignedUrl.mockClear();
  getSignedUrl.mockImplementation(async () => 'http://signed/logo');
  uploadBuffer.mockImplementation(async () => {});
});

const as = (who, req) => (who ? req.set('Authorization', `Bearer ${tokens[who]}`) : req);
const get = (who, tenant = 'a') =>
  as(who, request(app).get('/tenant/settings').set('x-tenant', tenant));
const patch = (who, body, tenant = 'a') =>
  as(who, request(app).patch('/tenant/settings').set('x-tenant', tenant)).send(body);
const upload = (who, buf, { name = 'logo.png', type = 'image/png', tenant = 'a' } = {}) =>
  as(who, request(app).post('/tenant/profile/logo').set('x-tenant', tenant)).attach('logo', buf, {
    filename: name,
    contentType: type,
  });
const removeLogo = (who, tenant = 'a') =>
  as(who, request(app).delete('/tenant/profile/logo').set('x-tenant', tenant));
const saved = async (key) => (await Tenant.findById(tenants[key]._id).lean()).profile;

describe('PATCH /tenant/settings with profile', () => {
  test('writes each key, and saving the address keeps the phone', async () => {
    const first = await patch('admin', {
      profile: { phone: '+91 98765 43210', description: 'A small school.' },
    });
    expect(first.status).toBe(200);
    expect(first.body.profile).toMatchObject({ phone: '+91 98765 43210' });

    const second = await patch('admin', {
      profile: { address: { city: 'Pune', state: 'MH' } },
    });
    expect(second.status).toBe(200);
    await patch('admin', { profile: { address: { pincode: '411001' } } });

    expect(await saved('a')).toMatchObject({
      phone: '+91 98765 43210',
      description: 'A small school.',
      address: { city: 'Pune', state: 'MH', pincode: '411001' },
    });
  });

  test('an empty string clears one key and leaves the rest', async () => {
    await patch('admin', { profile: { website: 'https://school.example', email: 'a@b.co' } });
    const res = await patch('admin', { profile: { website: '' } });
    expect(res.status).toBe(200);
    const p = await saved('a');
    expect(p.website).toBeUndefined();
    expect(p.email).toBe('a@b.co');
  });

  test('only tenant:admin may save', async () => {
    const before = await saved('a');
    const res = await patch('teacher', { profile: { phone: '1' } });
    expect(res.status).toBe(403);
    expect(await saved('a')).toEqual(before);
  });

  test('an unauthenticated call is refused', async () => {
    expect((await patch(null, { profile: { phone: '12345' } })).status).toBe(401);
  });

  test('bad values are rejected with 400 and nothing is saved', async () => {
    const before = await saved('a');
    for (const profile of [
      { website: 'javascript:alert(1)' },
      { website: 'ftp://files.example' },
      { website: 'not a url' },
      { email: 'nope' },
      { description: 'x'.repeat(1001) },
      { address: { line1: 'x'.repeat(201) } },
      { phone: 'x'.repeat(21) },
      { unknown: 1 },
      { address: { planet: 'Mars' } },
      { logoKey: 'branding/other/evil.png' },
    ]) {
      expect((await patch('admin', { profile })).status).toBe(400);
    }
    expect(await saved('a')).toEqual(before);
  });

  test('the org code cannot be changed', async () => {
    const before = (await Tenant.findById(tenants.a._id).lean()).orgCode;
    const res = await patch('admin', { name: 'Still Renamed', orgCode: 'AAAA2222' });
    expect(res.status).toBe(400);
    expect((await Tenant.findById(tenants.a._id).lean()).orgCode).toBe(before);
    // The rejected request saved nothing at all, name included.
    expect((await Tenant.findById(tenants.a._id).lean()).name).not.toBe('Still Renamed');
  });

  test('a profile edit is audited with before and after', async () => {
    await patch('admin', { profile: { address: { city: 'Nagpur' } } });
    await patch('admin', { profile: { address: { city: 'Mumbai' } } });
    const call = auditLog.mock.calls.at(-1)[0];
    expect(call).toMatchObject({
      action: 'tenant.profile_update',
      tenantId: String(tenants.a._id),
      target: { model: 'Tenant', id: String(tenants.a._id) },
    });
    expect(call.before.profile.address.city).toBe('Nagpur');
    expect(call.after.profile.address.city).toBe('Mumbai');
  });

  test('a save without profile writes no profile audit entry', async () => {
    await patch('admin', { timezone: 'Asia/Kolkata' });
    expect(auditLog.mock.calls.filter(([c]) => c.action === 'tenant.profile_update')).toHaveLength(
      0
    );
  });
});

describe('GET /tenant/settings', () => {
  beforeAll(async () => {
    await patch('admin', {
      profile: { registrationNumber: 'REG-12345', phone: '020 1234 5678' },
    });
  });

  test('members get orgCode and profile but not the registration number', async () => {
    const res = await get('teacher');
    expect(res.status).toBe(200);
    expect(res.body.orgCode).toMatch(/^[A-HJ-KM-NP-Z2-9]{8}$/);
    expect(res.body.profile.phone).toBe('020 1234 5678');
    expect(res.body.profile).not.toHaveProperty('registrationNumber');
    expect(res.body).not.toHaveProperty('joinPolicy');
  });

  test('tenant:admin also gets the registration number', async () => {
    const res = await get('admin');
    expect(res.body.profile.registrationNumber).toBe('REG-12345');
  });

  test('the raw storage key is never returned, only a signed url', async () => {
    expect((await upload('admin', PNG)).status).toBe(200);
    const res = await get('teacher');
    expect(res.body.profile.logoUrl).toBe('http://signed/logo');
    expect(res.body.profile).not.toHaveProperty('logoKey');
  });

  test('a storage failure drops the logo url but the rest still loads', async () => {
    getSignedUrl.mockImplementation(async () => {
      throw new Error('minio down');
    });
    const res = await get('teacher');
    expect(res.status).toBe(200);
    expect(res.body.profile).not.toHaveProperty('logoUrl');
    expect(res.body.profile.phone).toBe('020 1234 5678');
  });

  test('a tenant with no org code is given one, once', async () => {
    expect((await Tenant.findById(tenants.c._id).lean()).orgCode).toBeUndefined();
    const [x, y] = await Promise.all([get('adminC', 'c'), get('adminC', 'c')]);
    expect(x.body.orgCode).toMatch(/^[A-HJ-KM-NP-Z2-9]{8}$/);
    expect(y.body.orgCode).toBe(x.body.orgCode);
    expect((await Tenant.findById(tenants.c._id).lean()).orgCode).toBe(x.body.orgCode);
  });

  test('a tenant with nothing saved returns an empty profile, not an error', async () => {
    const res = await get('adminB', 'b');
    expect(res.status).toBe(200);
    expect(res.body.profile ?? {}).toEqual({});
  });
});

describe('profile logo', () => {
  test('uploads a PNG under the tenant branding prefix and audits it', async () => {
    const res = await upload('admin', PNG);
    expect(res.status).toBe(200);
    expect(res.body.profile.logoUrl).toBe('http://signed/logo');
    const [key, , mime] = uploadBuffer.mock.calls.at(-1);
    expect(key).toMatch(new RegExp(`^branding/${tenants.a._id}/org-logo-\\d+\\.png$`));
    expect(mime).toBe('image/png');
    expect(auditLog.mock.calls.at(-1)[0].action).toBe('tenant.logo_set');
  });

  test('replacing a logo removes the previous object', async () => {
    await upload('admin', PNG);
    const previous = (await saved('a')).logoKey;
    removeObject.mockClear();
    await new Promise((r) => setTimeout(r, 5));
    await upload('admin', PNG);
    expect(removeObject).toHaveBeenCalledWith(previous);
  });

  test('a text file with a png name is refused', async () => {
    const res = await upload('admin', Buffer.from('not an image at all'), { name: 'x.png' });
    expect(res.status).toBe(400);
    expect(uploadBuffer).not.toHaveBeenCalled();
  });

  test('a file over 500 KB is refused with 413', async () => {
    const big = Buffer.concat([PNG, Buffer.alloc(500 * 1024)]);
    expect((await upload('admin', big)).status).toBe(413);
  });

  test('only tenant:admin may upload or remove', async () => {
    expect((await upload('teacher', PNG)).status).toBe(403);
    expect((await removeLogo('teacher')).status).toBe(403);
  });

  test('an upload failure keeps the saved text and the previous logo', async () => {
    await patch('admin', { profile: { description: 'Kept text' } });
    await upload('admin', PNG);
    const before = await saved('a');
    uploadBuffer.mockImplementation(async () => {
      throw new Error('minio down');
    });
    const res = await upload('admin', PNG);
    expect(res.status).toBeGreaterThanOrEqual(500);
    expect(await saved('a')).toEqual(before);
  });

  test('removing clears the key, drops the object and audits', async () => {
    await upload('admin', PNG);
    const key = (await saved('a')).logoKey;
    removeObject.mockClear();
    const res = await removeLogo('admin');
    expect(res.status).toBe(200);
    expect((await saved('a')).logoKey).toBeUndefined();
    expect(removeObject).toHaveBeenCalledWith(key);
    expect(auditLog.mock.calls.at(-1)[0].action).toBe('tenant.logo_remove');
  });

  test('the report card logo is untouched by the org logo', async () => {
    await Tenant.updateOne(
      { _id: tenants.a._id },
      {
        $set: { 'settings.reportCard.logoKey': `branding/${tenants.a._id}/report-card-logo-1.png` },
      }
    );
    await upload('admin', PNG);
    await removeLogo('admin');
    expect((await Tenant.findById(tenants.a._id).lean()).settings.reportCard.logoKey).toContain(
      'report-card-logo-1'
    );
  });
});

describe('tenant isolation', () => {
  test('one tenant admin cannot read or change another tenant through their own token', async () => {
    // adminB holds no membership in tenant A, so the request resolves no permissions there.
    expect((await patch('adminB', { profile: { phone: '999 999' } }, 'a')).status).toBe(403);
    expect((await upload('adminB', PNG, { tenant: 'a' })).status).toBe(403);
    expect((await saved('a')).phone).not.toBe('999 999');
  });

  test("tenant A's profile never appears in tenant B's settings", async () => {
    const res = await get('adminB', 'b');
    expect(JSON.stringify(res.body)).not.toContain('020 1234 5678');
  });
});
