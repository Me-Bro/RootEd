import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { Student } from '../models/Student.js';

let mongod;
const tenantId = new mongoose.Types.ObjectId();

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  await Student.syncIndexes();
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

const student = (admissionNo, userId) =>
  Student.create({
    tenantId,
    admissionNo,
    firstName: 'A',
    lastName: 'B',
    ...(userId && { userId }),
  });

test('a whole roster can exist with no linked accounts', async () => {
  // The reason (tenantId, userId) is a *partial* index and not a sparse one.
  // A compound sparse index still indexes documents where any indexed field is
  // present — tenantId always is — so every unlinked student would collide on
  // userId: null and the second insert would fail. That is the normal case for
  // a school: a roster of pupils, none of whom have logins yet.
  for (let i = 0; i < 5; i += 1) {
    await expect(student(`ROSTER-${i}`)).resolves.toBeDefined();
  }
  expect(await Student.countDocuments({ tenantId, userId: { $exists: false } })).toBe(5);
});

test('one account cannot be linked to two students in the same tenant', async () => {
  const userId = new mongoose.Types.ObjectId();
  await student('LINKED-1', userId);
  await expect(student('LINKED-2', userId)).rejects.toMatchObject({ code: 11000 });
});

test('the same account may be a student in a different tenant', async () => {
  const userId = new mongoose.Types.ObjectId();
  await student('CROSS-1', userId);
  await expect(
    Student.create({
      tenantId: new mongoose.Types.ObjectId(),
      userId,
      admissionNo: 'CROSS-2',
      firstName: 'A',
      lastName: 'B',
    })
  ).resolves.toBeDefined();
});
