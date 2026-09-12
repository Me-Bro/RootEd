import { jest } from '@jest/globals';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { MigrationLog } from '../models/MigrationLog.js';
import { runMigrations } from '../utils/migrations.js';

let mongod;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

afterEach(async () => {
  await MigrationLog.deleteMany({});
});

test('applies a pending migration and records it', async () => {
  const up = jest.fn();
  await runMigrations([{ name: 'test-001', up }]);

  expect(up).toHaveBeenCalledTimes(1);
  const log = await MigrationLog.findOne({ name: 'test-001' }).lean();
  expect(log).not.toBeNull();
});

test('skips a migration already recorded', async () => {
  await MigrationLog.create({ name: 'test-002' });
  const up = jest.fn();

  await runMigrations([{ name: 'test-002', up }]);

  expect(up).not.toHaveBeenCalled();
});

test('a concurrent double-run of the same new migration does not crash', async () => {
  const up = jest.fn();

  await Promise.all([
    runMigrations([{ name: 'test-003', up }]),
    runMigrations([{ name: 'test-003', up }]),
  ]);

  const logs = await MigrationLog.find({ name: 'test-003' }).lean();
  expect(logs).toHaveLength(1);
});
