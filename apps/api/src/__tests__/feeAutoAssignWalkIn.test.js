// A structure's auto-assignment must never reach a walk-in: a visitor buys a plan
// through a sale, not by being on the roster when a structure is created.
import { jest } from '@jest/globals';

jest.unstable_mockModule('../config/redis.js', () => ({
  redis: { get: jest.fn(), setex: jest.fn(), del: jest.fn(), disconnect: jest.fn() },
  connectRedis: jest.fn(),
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
const { Student } = await import('../models/Student.js');
const { Section } = await import('../models/Section.js');
const { resolveStudentIdsForStructure } = await import('../services/fee.service.js');

let mongod;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

test('applicableTo "all" skips walk-ins but keeps members, including rows with no kind', async () => {
  const tenantId = new mongoose.Types.ObjectId();
  const member = await Student.create({
    tenantId,
    admissionNo: 'A-1',
    firstName: 'Mem',
    lastName: 'Ber',
  });
  await Student.create({
    tenantId,
    admissionNo: 'W-1',
    firstName: 'Walk',
    lastName: 'In',
    phone: '9876543210',
    kind: 'walk_in',
  });
  const legacy = await Student.collection.insertOne({
    tenantId,
    admissionNo: 'OLD-1',
    firstName: 'Old',
    lastName: 'Row',
    status: 'active',
  });

  const ids = await resolveStudentIdsForStructure({ applicableTo: 'all' }, tenantId);

  expect(ids.map(String).sort()).toEqual([String(member._id), String(legacy.insertedId)].sort());
});

test('applicableTo "class" skips walk-ins too', async () => {
  const tenantId = new mongoose.Types.ObjectId();
  const classId = new mongoose.Types.ObjectId();
  const section = await Section.create({ tenantId, classId, name: 'Morning' });
  const member = await Student.create({
    tenantId,
    admissionNo: 'C-1',
    firstName: 'Mem',
    lastName: 'Ber',
    sectionId: section._id,
  });
  await Student.create({
    tenantId,
    admissionNo: 'W-2',
    firstName: 'Walk',
    lastName: 'In',
    phone: '9811111111',
    kind: 'walk_in',
    sectionId: section._id,
  });

  const ids = await resolveStudentIdsForStructure({ applicableTo: 'class', classId }, tenantId);

  expect(ids.map(String)).toEqual([String(member._id)]);
});
