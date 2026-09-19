import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { User } from '../models/User.js';
import { hashPassword } from '../services/auth.service.js';
import { findOrCreateGoogleUser } from '../services/googleAuth.service.js';
import { redis } from '../config/redis.js';

let mongod;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  await User.init();
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
  redis.disconnect();
});

test('creates a new account when no user matches the email', async () => {
  const { user, created } = await findOrCreateGoogleUser({
    email: 'brandnew@example.com',
    googleId: 'sub-new',
    firstName: 'New',
    lastName: 'Person',
  });

  expect(created).toBe(true);
  expect(user.googleId).toBe('sub-new');
  expect(user.emailVerified).toBe(true);
  expect(user.status).toBe('active');
  expect(user.username).toBeTruthy();

  const stored = await User.findById(user._id).select('+passwordHash');
  expect(stored.passwordHash).toBeUndefined();
});

test('derives a non-colliding username when the local-part is already taken', async () => {
  await User.create({
    email: 'someoneelse@school.edu',
    username: 'dupe',
    usernameLower: 'dupe',
    passwordHash: await hashPassword('irrelevant-but-valid'),
  });

  const { user } = await findOrCreateGoogleUser({
    email: 'dupe@example.com',
    googleId: 'sub-dupe',
    firstName: 'Dupe',
    lastName: 'User',
  });

  expect(user.usernameLower).not.toBe('dupe');
});

test('auto-links an existing active password account by verified email', async () => {
  const existing = await User.create({
    email: 'linkme@example.com',
    username: 'linkme',
    usernameLower: 'linkme',
    passwordHash: await hashPassword('irrelevant-but-valid'),
    emailVerified: true,
    status: 'active',
  });

  const { user, created } = await findOrCreateGoogleUser({
    email: 'linkme@example.com',
    googleId: 'sub-link',
    firstName: 'Link',
    lastName: 'Me',
  });

  expect(created).toBe(false);
  expect(String(user._id)).toBe(String(existing._id));

  const stored = await User.findById(existing._id).select('+passwordHash +googleId');
  expect(stored.googleId).toBe('sub-link');
  expect(stored.passwordHash).toBeTruthy();
});

test('activates a pending_verification account instead of blocking it', async () => {
  const existing = await User.create({
    email: 'pending@example.com',
    username: 'pending',
    usernameLower: 'pending',
    passwordHash: await hashPassword('irrelevant-but-valid'),
    emailVerified: false,
    status: 'pending_verification',
  });

  const { user } = await findOrCreateGoogleUser({
    email: 'pending@example.com',
    googleId: 'sub-pending',
    firstName: 'Pend',
    lastName: 'Ing',
  });

  expect(user.status).toBe('active');
  expect(user.emailVerified).toBe(true);
  expect(String(user._id)).toBe(String(existing._id));
});

test('rejects a suspended account the same way password login does', async () => {
  await User.create({
    email: 'suspended@example.com',
    username: 'suspended',
    usernameLower: 'suspended',
    passwordHash: await hashPassword('irrelevant-but-valid'),
    status: 'suspended',
  });

  await expect(
    findOrCreateGoogleUser({
      email: 'suspended@example.com',
      googleId: 'sub-suspended',
      firstName: 'S',
      lastName: 'D',
    })
  ).rejects.toMatchObject({ status: 403 });
});

test('rejects a deleted account the same way password login does', async () => {
  await User.create({
    email: 'deleted@example.com',
    username: 'deleted',
    usernameLower: 'deleted',
    passwordHash: await hashPassword('irrelevant-but-valid'),
    status: 'deleted',
  });

  await expect(
    findOrCreateGoogleUser({
      email: 'deleted@example.com',
      googleId: 'sub-deleted',
      firstName: 'D',
      lastName: 'D',
    })
  ).rejects.toMatchObject({ status: 401 });
});
