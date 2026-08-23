// Builds a minimal Express harness instead of importing the full app.js —
// app.js pulls in utils/sanitize.js, which constructs a JSDOM at module load
// time; that transitively requires a CJS module from an ESM-only package
// (@exodus/bytes) and crashes under Jest's --experimental-vm-modules. This
// harness still exercises the real resolveTenant + requireModuleEnabled
// middleware against a real MongoDB, just without app.js's unrelated stack.
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import express from 'express';
import request from 'supertest';
import { Tenant } from '../models/Tenant.js';
import { resolveTenant } from '../middleware/resolveTenant.js';
import { requireModuleEnabled } from '../middleware/requireModuleEnabled.js';
import { errorHandler } from '../middleware/errorHandler.js';

let mongod;
let app;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());

  await Tenant.create({
    name: 'Gating School',
    subdomain: 'gatingschool',
    orgType: 'school',
    status: 'active',
  });
  await Tenant.create({
    name: 'Gating Tuition',
    subdomain: 'gatingtuition',
    orgType: 'tuition_center',
    status: 'active',
  });

  app = express();
  app.use(resolveTenant);
  app.get('/inventory', requireModuleEnabled('inventory'), (_req, res) => res.json({ ok: true }));
  app.get('/fee', requireModuleEnabled('fee'), (_req, res) => res.json({ ok: true }));
  app.use(errorHandler);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

test('inventory route is reachable for a school-orgType tenant', async () => {
  const res = await request(app).get('/inventory').set('Host', 'gatingschool.rooted.app');
  expect(res.status).toBe(200);
});

test('inventory route is 403-blocked by requireModuleEnabled for a tuition_center-orgType tenant', async () => {
  const res = await request(app).get('/inventory').set('Host', 'gatingtuition.rooted.app');
  expect(res.status).toBe(403);
  expect(res.body.error).toMatch(/not enabled/i);
});

test('fee route (enabled for every orgType) is reachable for a tuition_center tenant', async () => {
  const res = await request(app).get('/fee').set('Host', 'gatingtuition.rooted.app');
  expect(res.status).toBe(200);
});

test('unresolvable tenant subdomain 404s before module gating runs', async () => {
  const res = await request(app).get('/inventory').set('Host', 'no-such-tenant.rooted.app');
  expect(res.status).toBe(404);
});
