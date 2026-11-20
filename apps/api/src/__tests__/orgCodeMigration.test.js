import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { Tenant } from '../models/Tenant.js';
import { up } from '../migrations/0010-backfill-org-codes.js';

let mongod;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  await Tenant.syncIndexes();
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

test('backfills every tenant, whatever its status, and is idempotent', async () => {
  const existing = await Tenant.create({ name: 'Already', orgCode: 'KEEP2222' });
  await Tenant.create([
    { name: 'Active', status: 'active' },
    { name: 'Suspended', status: 'suspended' },
    { name: 'Archived', status: 'archived' },
  ]);

  await up();
  const first = await Tenant.find({}).lean();
  const codes = first.map((t) => t.orgCode);
  expect(codes.every((c) => /^[A-HJ-KM-NP-Z2-9]{8}$/.test(c))).toBe(true);
  expect(new Set(codes).size).toBe(first.length);
  expect(first.find((t) => String(t._id) === String(existing._id)).orgCode).toBe('KEEP2222');

  await up();
  const second = await Tenant.find({}).lean();
  const byId = (list) => Object.fromEntries(list.map((t) => [String(t._id), t.orgCode]));
  expect(byId(second)).toEqual(byId(first));
});
