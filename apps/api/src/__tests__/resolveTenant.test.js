import { jest } from '@jest/globals';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { Tenant } from '../models/Tenant.js';
import { resolveTenant } from '../middleware/resolveTenant.js';
import { signAccessToken } from '../services/auth.service.js';
import { redis } from '../config/redis.js';
import { env } from '../config/env.js';

let mongod;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
  redis.disconnect();
});

function mockReq({ hostname, token }) {
  return {
    hostname,
    headers: token ? { authorization: `Bearer ${token}` } : {},
  };
}

async function run(req) {
  const next = jest.fn();
  await resolveTenant(req, {}, next);
  return next;
}

test('subdomain Host resolves the matching active tenant', async () => {
  const tenant = await Tenant.create({ name: 'Acme', subdomain: 'acme', status: 'active' });

  const req = mockReq({ hostname: 'acme.rooted.app' });
  const next = await run(req);

  expect(next).toHaveBeenCalledWith();
  expect(req.tenant._id.toString()).toBe(tenant._id.toString());
});

test('subdomain Host with no matching tenant → 404', async () => {
  const req = mockReq({ hostname: 'nobody.rooted.app' });
  const next = await run(req);

  expect(next).toHaveBeenCalledTimes(1);
  const err = next.mock.calls[0][0];
  expect(err.status).toBe(404);
});

test('no-subdomain Host with no bearer token → 404', async () => {
  const req = mockReq({ hostname: 'rooted.app' });
  const next = await run(req);

  const err = next.mock.calls[0][0];
  expect(err.status).toBe(404);
  expect(req.tenant).toBeUndefined();
});

test('no-subdomain Host + tenantId claim on token resolves that tenant', async () => {
  const tenant = await Tenant.create({ name: 'Beta', subdomain: 'beta', status: 'active' });
  const token = signAccessToken({ sub: 'user-1', tenantId: tenant._id.toString() });

  const req = mockReq({ hostname: 'rooted.app', token });
  const next = await run(req);

  expect(next).toHaveBeenCalledWith();
  expect(req.tenant._id.toString()).toBe(tenant._id.toString());
});

test('no-subdomain Host + tenantId claim pointing at a suspended tenant → 404', async () => {
  const tenant = await Tenant.create({ name: 'Gamma', subdomain: 'gamma', status: 'suspended' });
  const token = signAccessToken({ sub: 'user-1', tenantId: tenant._id.toString() });

  const req = mockReq({ hostname: 'rooted.app', token });
  const next = await run(req);

  const err = next.mock.calls[0][0];
  expect(err.status).toBe(404);
});

test('no-subdomain Host + garbage token → 404, not a 500', async () => {
  const req = mockReq({ hostname: 'rooted.app', token: 'not-a-real-jwt' });
  const next = await run(req);

  const err = next.mock.calls[0][0];
  expect(err.status).toBe(404);
});

test('PORTAL_SUBDOMAIN Host is treated as the general portal, not a real tenant lookup', async () => {
  env.PORTAL_SUBDOMAIN = 'portal';
  try {
    const tenant = await Tenant.create({ name: 'Delta', subdomain: 'delta', status: 'active' });
    const token = signAccessToken({ sub: 'user-1', tenantId: tenant._id.toString() });

    const req = mockReq({ hostname: 'portal.rooted.app', token });
    const next = await run(req);

    expect(next).toHaveBeenCalledWith();
    expect(req.tenant._id.toString()).toBe(tenant._id.toString());
  } finally {
    env.PORTAL_SUBDOMAIN = undefined;
  }
});

test('impersonatedTenantId claim resolves the tenant on the general-portal host', async () => {
  const tenant = await Tenant.create({ name: 'Epsilon', status: 'active' });
  const token = signAccessToken({
    sub: 'super-admin-1',
    systemRole: 'super_admin',
    impersonatedTenantId: tenant._id.toString(),
  });

  const req = mockReq({ hostname: 'rooted.app', token });
  const next = await run(req);

  expect(next).toHaveBeenCalledWith();
  expect(req.tenant._id.toString()).toBe(tenant._id.toString());
});
