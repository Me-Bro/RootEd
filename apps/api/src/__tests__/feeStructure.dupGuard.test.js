import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { FeeStructure } from '../models/FeeStructure.js';

let mongod;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

test('same tenant+name+year is a duplicate', async () => {
  const tenantId = new mongoose.Types.ObjectId();
  const academicYearId = new mongoose.Types.ObjectId();
  await FeeStructure.create({
    tenantId,
    name: 'X',
    academicYearId,
    components: [{ label: 'T', amount: 100 }],
  });

  const existing = await FeeStructure.findOne({ tenantId, name: 'X', academicYearId });
  expect(existing).not.toBeNull();
});

test('same name, different tenant is not a duplicate', async () => {
  const tenantA = new mongoose.Types.ObjectId();
  const tenantB = new mongoose.Types.ObjectId();
  const academicYearId = new mongoose.Types.ObjectId();
  await FeeStructure.create({
    tenantId: tenantA,
    name: 'Shared Name',
    academicYearId,
    components: [{ label: 'T', amount: 100 }],
  });

  const existing = await FeeStructure.findOne({
    tenantId: tenantB,
    name: 'Shared Name',
    academicYearId,
  });
  expect(existing).toBeNull();
});

test('same name, different academicYearId is not a duplicate', async () => {
  const tenantId = new mongoose.Types.ObjectId();
  const yearA = new mongoose.Types.ObjectId();
  const yearB = new mongoose.Types.ObjectId();
  await FeeStructure.create({
    tenantId,
    name: 'Same Name Different Year',
    academicYearId: yearA,
    components: [{ label: 'T', amount: 100 }],
  });

  const existing = await FeeStructure.findOne({
    tenantId,
    name: 'Same Name Different Year',
    academicYearId: yearB,
  });
  expect(existing).toBeNull();
});
