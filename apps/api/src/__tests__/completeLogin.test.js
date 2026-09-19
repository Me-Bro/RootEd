import { jest } from '@jest/globals';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { authenticator } from 'otplib';
import { User } from '../models/User.js';
import { hashPassword } from '../services/auth.service.js';
import { enableMfa } from '../services/mfa.service.js';
import { completeLogin } from '../routes/auth.js';
import { redis } from '../config/redis.js';

let mongod;
let n = 0;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
  redis.disconnect();
});

// completeLogin is shared by POST /login and POST /auth/google — these cases
// only exercise its super_admin MFA gate, which throws before anything that
// touches Redis (audit log) or issues tokens, so they're safe to run without
// a live Redis/Mongo replica set.
async function makeSuperAdminWithMfa() {
  n += 1;
  const user = await User.create({
    email: `mfa-${n}@example.com`,
    username: `mfa-${n}`,
    usernameLower: `mfa-${n}`,
    passwordHash: await hashPassword('irrelevant-but-valid'),
    systemRole: 'super_admin',
    status: 'active',
  });
  await enableMfa(user._id, authenticator.generateSecret());
  return User.findById(user._id).select('+mfaSecret +mfaEnabled');
}

const fakeRes = () => ({ cookie: jest.fn(), json: jest.fn() });
const fakeReq = () => ({ ip: '127.0.0.1', headers: {} });

test('rejects a super_admin sign-in with no totpCode', async () => {
  const user = await makeSuperAdminWithMfa();
  await expect(
    completeLogin(user, {
      req: fakeReq(),
      res: fakeRes(),
      totpCode: undefined,
      auditAction: 'auth.login',
    })
  ).rejects.toMatchObject({ status: 401, message: 'TOTP code required' });
});

test('rejects a super_admin sign-in with a wrong totpCode', async () => {
  const user = await makeSuperAdminWithMfa();
  await expect(
    completeLogin(user, {
      req: fakeReq(),
      res: fakeRes(),
      totpCode: '000000',
      auditAction: 'auth.login',
    })
  ).rejects.toMatchObject({ status: 401, message: 'Invalid TOTP code' });
});
