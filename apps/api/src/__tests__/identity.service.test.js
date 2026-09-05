import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import crypto from 'crypto';
import { User } from '../models/User.js';
import { UsernameHistory } from '../models/UsernameHistory.js';
import { hashPassword } from '../services/auth.service.js';
import {
  loginFilterFor,
  isUsernameAvailable,
  applyUsernameChange,
  issueEmailVerification,
  issueEmailChange,
  deriveUsernameFromEmail,
  USERNAME_CHANGE_COOLDOWN_MS,
} from '../services/identity.service.js';
import { redis } from '../config/redis.js';

let mongod;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  await User.syncIndexes();
  await UsernameHistory.syncIndexes();
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
  redis.disconnect();
});

async function makeUser(email, username) {
  return User.create({
    email,
    username,
    usernameLower: username,
    passwordHash: await hashPassword('irrelevant-but-valid'),
  });
}

describe('loginFilterFor', () => {
  test('an identifier containing @ is looked up as an email', () => {
    expect(loginFilterFor('Someone@School.EDU')).toEqual({ email: 'someone@school.edu' });
  });

  test('anything else is looked up as a username', () => {
    expect(loginFilterFor('  P.Sharma ')).toEqual({ usernameLower: 'p.sharma' });
  });
});

describe('isUsernameAvailable', () => {
  test('an unused username is available', async () => {
    expect(await isUsernameAvailable('brand-new-handle')).toBe(true);
  });

  test('a username somebody holds is not available', async () => {
    await makeUser('holder@test.local', 'held-handle');
    expect(await isUsernameAvailable('held-handle')).toBe(false);
  });

  test('your own username is available to you', async () => {
    const user = await makeUser('self@test.local', 'self-handle');
    expect(await isUsernameAvailable('self-handle')).toBe(false);
    expect(await isUsernameAvailable('self-handle', { forUserId: user._id })).toBe(true);
  });

  test('a released username stays parked against everyone else', async () => {
    const user = await makeUser('mover@test.local', 'old-handle');
    await applyUsernameChange(user, 'new-handle');
    await user.save();

    // The impersonation case: somebody else grabbing the handle just freed.
    expect(await isUsernameAvailable('old-handle')).toBe(false);
    // …but the person who released it can take it back.
    expect(await isUsernameAvailable('old-handle', { forUserId: user._id })).toBe(true);
  });
});

describe('applyUsernameChange', () => {
  test('parks the previous handle with an expiry', async () => {
    const user = await makeUser('park@test.local', 'park-before');
    await applyUsernameChange(user, 'park-after');
    await user.save();

    const parked = await UsernameHistory.findOne({ usernameLower: 'park-before' }).lean();
    expect(String(parked.userId)).toBe(String(user._id));
    expect(parked.expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(user.usernameLower).toBe('park-after');
  });

  test('rejects a handle somebody else holds', async () => {
    await makeUser('occupier@test.local', 'occupied-handle');
    const user = await makeUser('wants@test.local', 'wants-handle');
    await expect(applyUsernameChange(user, 'occupied-handle')).rejects.toThrow(/taken/i);
  });

  test('enforces the change cooldown', async () => {
    const user = await makeUser('cooldown@test.local', 'cooldown-one');
    await applyUsernameChange(user, 'cooldown-two');
    await user.save();

    await expect(applyUsernameChange(user, 'cooldown-three')).rejects.toThrow(/day/i);
  });

  test('allows a change once the cooldown has elapsed', async () => {
    const user = await makeUser('elapsed@test.local', 'elapsed-one');
    user.usernameChangedAt = new Date(Date.now() - USERNAME_CHANGE_COOLDOWN_MS - 1000);
    await applyUsernameChange(user, 'elapsed-two');
    await user.save();
    expect(user.usernameLower).toBe('elapsed-two');
  });

  test('re-setting the same username is a no-op and does not burn the cooldown', async () => {
    const user = await makeUser('noop@test.local', 'noop-handle');
    expect(await applyUsernameChange(user, 'noop-handle')).toBe(false);
    expect(user.usernameChangedAt).toBeUndefined();
  });
});

describe('token issuance', () => {
  test('the raw verification token is never persisted', async () => {
    const user = await makeUser('verify@test.local', 'verify-handle');
    const token = await issueEmailVerification(user._id);

    const stored = await User.findById(user._id)
      .select('+emailVerificationToken +emailVerificationExpires')
      .lean();
    expect(stored.emailVerificationToken).not.toBe(token);
    expect(stored.emailVerificationToken).toBe(
      crypto.createHash('sha256').update(token).digest('hex')
    );
    expect(stored.emailVerificationExpires.getTime()).toBeGreaterThan(Date.now());
  });

  test('an email change stages the address without touching the live one', async () => {
    const user = await makeUser('change@test.local', 'change-handle');
    const token = await issueEmailChange(user._id, 'moved@test.local');

    const stored = await User.findById(user._id).select('+pendingEmailToken').lean();
    expect(stored.email).toBe('change@test.local');
    expect(stored.pendingEmail).toBe('moved@test.local');
    expect(stored.pendingEmailToken).toBe(crypto.createHash('sha256').update(token).digest('hex'));
  });
});

describe('deriveUsernameFromEmail', () => {
  test('uses the email local part', async () => {
    expect(await deriveUsernameFromEmail('rita.bose@school.edu')).toBe('rita.bose');
  });

  test('strips characters a username cannot contain', async () => {
    expect(await deriveUsernameFromEmail('a+b!c@school.edu')).toBe('abc');
  });

  test('suffixes on collision rather than failing', async () => {
    await makeUser('taken-derive@test.local', 'collide');
    const derived = await deriveUsernameFromEmail('collide@elsewhere.local');
    expect(derived).not.toBe('collide');
    expect(await isUsernameAvailable(derived)).toBe(true);
  });
});
