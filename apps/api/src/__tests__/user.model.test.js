import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { User } from '../models/User.js';

let mongod;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  // Index builds happen async after connect — the uniqueness test below needs
  // the googleId index to actually exist before it inserts a duplicate.
  await User.init();
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

test('a Google-linked user needs no passwordHash', async () => {
  const user = await User.create({
    email: 'google-only@example.com',
    googleId: 'google-sub-1',
  });
  expect(user.passwordHash).toBeUndefined();
});

test('a user with neither passwordHash nor googleId fails validation', async () => {
  await expect(User.create({ email: 'no-credentials@example.com' })).rejects.toThrow(
    mongoose.Error.ValidationError
  );
});

test('a password user still requires passwordHash', async () => {
  await expect(
    User.create({ email: 'still-required@example.com', googleId: undefined })
  ).rejects.toThrow(mongoose.Error.ValidationError);
});

test('googleId is unique when set', async () => {
  await User.create({ email: 'first@example.com', googleId: 'dup-sub' });
  await expect(User.create({ email: 'second@example.com', googleId: 'dup-sub' })).rejects.toThrow();
});
