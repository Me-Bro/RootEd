import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { Feedback } from '../models/Feedback.js';

let mongod;
beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});
afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

test('a fully anonymous submission (no tenantId, no userId) saves fine', async () => {
  const doc = await Feedback.create({
    category: 'contact',
    name: 'Jane Doe',
    email: 'jane@example.com',
    message: 'Hello there',
  });
  expect(doc.tenantId).toBeUndefined();
  expect(doc.userId).toBeUndefined();
  expect(doc.status).toBe('new');
});

test('finding with no tenantId filter does not throw (global collection, no tenant scope)', async () => {
  await expect(Feedback.find({})).resolves.toBeInstanceOf(Array);
});

test('a submission can carry tenantId + userId for a logged-in submitter', async () => {
  const tenantId = new mongoose.Types.ObjectId();
  const userId = new mongoose.Types.ObjectId();
  const doc = await Feedback.create({
    category: 'feedback',
    name: 'Teacher T',
    email: 'teacher@testschool.local',
    message: 'Great app',
    tenantId,
    userId,
  });
  expect(doc.tenantId).toEqual(tenantId);
  expect(doc.userId).toEqual(userId);
});
