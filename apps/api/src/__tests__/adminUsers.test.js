// Super-admin user lookup, resend and manual approval of email verification,
// through the real /admin router against an in-memory Mongo.
import { jest } from '@jest/globals';

const auditLog = jest.fn().mockResolvedValue(undefined);
jest.unstable_mockModule('../services/audit.service.js', () => ({
  auditLog,
  processAuditLog: jest.fn(),
}));
// The test env's default EMAIL_PROVIDER is smtp; capture what would be sent.
const sendViaSmtp = jest.fn().mockResolvedValue(undefined);
jest.unstable_mockModule('../services/email/smtpAdapter.js', () => ({
  createSmtpTransport: jest.fn(() => ({})),
  sendViaSmtp,
}));

const { MongoMemoryServer } = await import('mongodb-memory-server');
const { default: mongoose } = await import('mongoose');
const { default: express } = await import('express');
const { default: request } = await import('supertest');
const { User } = await import('../models/User.js');
const { signAccessToken, hashPassword } = await import('../services/auth.service.js');
const { errorHandler } = await import('../middleware/errorHandler.js');
const { default: adminRouter } = await import('../routes/admin.js');
const { redis } = await import('../config/redis.js');

let mongod;
let app;
let admin;
let pending;
let suspended;
let verified;

const token = (extra = {}) => signAccessToken({ sub: String(admin._id), ...extra });
const superToken = () => token({ systemRole: 'super_admin' });
const as = (method, url, tok = superToken()) =>
  request(app)[method](url).set('Authorization', `Bearer ${tok}`);

const mk = async (email, extra = {}) =>
  User.create({
    email,
    username: email.split('@')[0],
    usernameLower: email.split('@')[0],
    passwordHash: await hashPassword('irrelevant-but-valid'),
    ...extra,
  });

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  app = express();
  app.use(express.json());
  app.use('/admin', adminRouter);
  app.use(errorHandler);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
  redis.disconnect();
});

beforeEach(async () => {
  await User.deleteMany({});
  jest.clearAllMocks();
  admin = await mk('root@platform.test', { emailVerified: true, status: 'active' });
  pending = await mk('new.user@school.test', {
    emailVerified: false,
    status: 'pending_verification',
  });
  suspended = await mk('susp@school.test', { emailVerified: false, status: 'suspended' });
  verified = await mk('ok@school.test', { emailVerified: true, status: 'active' });
});

describe('GET /admin/users', () => {
  test('lists everyone with paging totals and no secrets', async () => {
    const res = await as('get', '/admin/users');
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(4);
    expect(res.body.users[0]).not.toHaveProperty('passwordHash');
  });

  test('unverified filter keeps only unverified accounts', async () => {
    const res = await as('get', '/admin/users?unverified=1');
    expect(res.body.users.map((u) => u.email).sort()).toEqual([
      'new.user@school.test',
      'susp@school.test',
    ]);
  });

  test('searches by email and treats regex characters literally', async () => {
    expect((await as('get', '/admin/users?q=new.user')).body.total).toBe(1);
    expect((await as('get', '/admin/users?q=.*')).body.total).toBe(0);
  });

  test('filters by status and ignores an unknown one', async () => {
    expect((await as('get', '/admin/users?status=suspended')).body.total).toBe(1);
    expect((await as('get', '/admin/users?status=bogus')).body.total).toBe(4);
  });

  test('is for the platform super admin only', async () => {
    expect((await request(app).get('/admin/users')).status).toBe(401);
    expect((await as('get', '/admin/users', token())).status).toBe(403);
  });
});

describe('POST /admin/users/:id/verify-email', () => {
  test('verifies, activates a pending user and clears the token', async () => {
    await User.updateOne({ _id: pending._id }, { emailVerificationToken: 'abc' });
    const res = await as('post', `/admin/users/${pending._id}/verify-email`);
    expect(res.status).toBe(200);
    const doc = await User.findById(pending._id).select('+emailVerificationToken').lean();
    expect(doc).toMatchObject({ emailVerified: true, status: 'active' });
    expect(doc.emailVerificationToken).toBeUndefined();
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'user.email_verified_by_admin' })
    );
  });

  test('leaves a suspended user suspended', async () => {
    await as('post', `/admin/users/${suspended._id}/verify-email`);
    expect(await User.findById(suspended._id).lean()).toMatchObject({
      emailVerified: true,
      status: 'suspended',
    });
  });

  test('400 when already verified, 404 for missing, malformed or deleted', async () => {
    expect((await as('post', `/admin/users/${verified._id}/verify-email`)).status).toBe(400);
    expect(
      (await as('post', `/admin/users/${new mongoose.Types.ObjectId()}/verify-email`)).status
    ).toBe(404);
    expect((await as('post', '/admin/users/nope/verify-email')).status).toBe(404);
    await User.updateOne({ _id: pending._id }, { status: 'deleted' });
    expect((await as('post', `/admin/users/${pending._id}/verify-email`)).status).toBe(404);
  });

  test('is for the platform super admin only', async () => {
    expect((await as('post', `/admin/users/${pending._id}/verify-email`, token())).status).toBe(
      403
    );
    expect((await User.findById(pending._id).lean()).emailVerified).toBe(false);
  });
});

describe('POST /admin/users/:id/resend-verification', () => {
  test('issues a fresh token and mails a verify link', async () => {
    const res = await as('post', `/admin/users/${pending._id}/resend-verification`);
    expect(res.status).toBe(200);
    const doc = await User.findById(pending._id).select('+emailVerificationToken').lean();
    expect(doc.emailVerificationToken).toBeTruthy();
    expect(sendViaSmtp).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        to: 'new.user@school.test',
        html: expect.stringContaining('/verify-email?token='),
      })
    );
  });

  test('400 and no mail for an already verified user', async () => {
    expect((await as('post', `/admin/users/${verified._id}/resend-verification`)).status).toBe(400);
    expect(sendViaSmtp).not.toHaveBeenCalled();
  });

  test('is for the platform super admin only', async () => {
    expect(
      (await as('post', `/admin/users/${pending._id}/resend-verification`, token())).status
    ).toBe(403);
    expect(sendViaSmtp).not.toHaveBeenCalled();
  });
});
