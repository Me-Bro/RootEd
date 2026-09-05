import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import crypto from 'crypto';
import { User } from '../models/User.js';
import {
  generateToken,
  hashToken,
  storeResetToken,
  hashPassword,
  INVITE_TOKEN_TTL_MS,
} from '../services/auth.service.js';
import { redis } from '../config/redis.js';

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

async function makeUser(email) {
  return User.create({ email, passwordHash: await hashPassword('irrelevant-but-valid') });
}

test('the raw reset token is never persisted', async () => {
  const user = await makeUser('reset-raw@test.local');
  const token = generateToken();
  await storeResetToken(user._id, token);

  const stored = await User.findById(user._id).select('+passwordResetToken').lean();
  expect(stored.passwordResetToken).not.toBe(token);
  expect(stored.passwordResetToken).toBe(crypto.createHash('sha256').update(token).digest('hex'));
});

test('a stolen database value cannot be replayed as a token', async () => {
  const user = await makeUser('reset-replay@test.local');
  const token = generateToken();
  await storeResetToken(user._id, token);

  const stored = await User.findById(user._id).select('+passwordResetToken').lean();

  // What the reset route does: hash whatever the caller supplied, then look up.
  // Feeding it the digest read out of the database must not find anybody.
  const replayed = await User.findOne({
    passwordResetToken: hashToken(stored.passwordResetToken),
    passwordResetExpires: { $gt: new Date() },
  }).lean();
  expect(replayed).toBeNull();

  // The raw token from the email still resolves.
  const legitimate = await User.findOne({
    passwordResetToken: hashToken(token),
    passwordResetExpires: { $gt: new Date() },
  }).lean();
  expect(legitimate?._id.toString()).toBe(user._id.toString());
});

test('two tokens for the same user never collide', async () => {
  const user = await makeUser('reset-rotate@test.local');
  const first = generateToken();
  await storeResetToken(user._id, first);
  const second = generateToken();
  await storeResetToken(user._id, second);

  expect(first).not.toBe(second);

  const byFirst = await User.findOne({ passwordResetToken: hashToken(first) }).lean();
  const bySecond = await User.findOne({ passwordResetToken: hashToken(second) }).lean();
  expect(byFirst).toBeNull();
  expect(bySecond?._id.toString()).toBe(user._id.toString());
});

test('the invite TTL is honoured and is longer than the reset TTL', async () => {
  const user = await makeUser('reset-ttl@test.local');
  const before = Date.now();
  await storeResetToken(user._id, generateToken(), INVITE_TOKEN_TTL_MS);

  const stored = await User.findById(user._id).select('+passwordResetExpires').lean();
  const ttl = stored.passwordResetExpires.getTime() - before;
  // 48h, allowing for the round trip
  expect(ttl).toBeGreaterThan(47 * 60 * 60 * 1000);
  expect(ttl).toBeLessThanOrEqual(INVITE_TOKEN_TTL_MS + 5000);
});

test('an expired token does not resolve', async () => {
  const user = await makeUser('reset-expired@test.local');
  const token = generateToken();
  await storeResetToken(user._id, token, -1000);

  const found = await User.findOne({
    passwordResetToken: hashToken(token),
    passwordResetExpires: { $gt: new Date() },
  }).lean();
  expect(found).toBeNull();
});
