// markBounced, the Postmark bounce webhook (through a mini Express app, since the full
// app.js cannot load under Jest) and the hard-failure classifier.
process.env.POSTMARK_WEBHOOK_SECRET = 'jest-webhook-secret-16+chars';

const { MongoMemoryServer } = await import('mongodb-memory-server');
const { default: mongoose } = await import('mongoose');
const { default: express } = await import('express');
const { default: request } = await import('supertest');
const { User } = await import('../models/User.js');
const { markBounced } = await import('../services/emailBounce.service.js');
const { isHardRecipientFailure } = await import('../services/email/classifyEmailError.js');
const { default: webhooksRouter } = await import('../routes/webhooks.js');

let mongod;
let app;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  app = express();
  app.use(express.json());
  app.use('/webhooks', webhooksRouter);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

beforeEach(async () => {
  await User.deleteMany({});
  await User.create({ email: 'dead@example.test', passwordHash: 'x', username: 'dead' });
});

const basic = (password) => `Basic ${Buffer.from(`postmark:${password}`).toString('base64')}`;
const post = (body, auth = basic(process.env.POSTMARK_WEBHOOK_SECRET)) => {
  const req = request(app).post('/webhooks/postmark/bounce').send(body);
  return auth ? req.set('Authorization', auth) : req;
};
const bouncedAt = async () =>
  (await User.findOne({ email: 'dead@example.test' }).lean()).emailBouncedAt;

test('markBounced flags the account, case-insensitively', async () => {
  expect(await markBounced(' Dead@Example.test ', 'HardBounce')).toBe(1);
  const user = await User.findOne({ email: 'dead@example.test' }).lean();
  expect(user.emailBouncedAt).toBeInstanceOf(Date);
  expect(user.emailBounceReason).toBe('HardBounce');
});

test('markBounced is a no-op for an address with no account', async () => {
  expect(await markBounced('nobody@example.test', 'HardBounce')).toBe(0);
  expect(await markBounced('', 'HardBounce')).toBe(0);
});

test('webhook: a hard bounce flags the user', async () => {
  await post({ Type: 'HardBounce', Email: 'dead@example.test' }).expect(200);
  expect(await bouncedAt()).toBeInstanceOf(Date);
});

test('webhook: a bad-address bounce flags the user', async () => {
  await post({ Type: 'BadEmailAddress', Email: 'dead@example.test' }).expect(200);
  expect(await bouncedAt()).toBeInstanceOf(Date);
});

test('webhook: soft bounces and spam complaints are acknowledged but ignored', async () => {
  await post({ Type: 'SoftBounce', Email: 'dead@example.test' }).expect(200);
  await post({ Type: 'SpamComplaint', Email: 'dead@example.test' }).expect(200);
  expect(await bouncedAt()).toBeUndefined();
});

test('webhook: no credentials or the wrong secret is a 401 and changes nothing', async () => {
  await post({ Type: 'HardBounce', Email: 'dead@example.test' }, null).expect(401);
  await post({ Type: 'HardBounce', Email: 'dead@example.test' }, basic('wrong')).expect(401);
  await post({ Type: 'HardBounce', Email: 'dead@example.test' }, 'Bearer nope').expect(401);
  expect(await bouncedAt()).toBeUndefined();
});

test('isHardRecipientFailure: no such user yes, mailbox full / policy / outage no', () => {
  expect(isHardRecipientFailure({ code: 300 })).toBe(true); // Postmark invalid email
  expect(isHardRecipientFailure({ code: 406 })).toBe(true); // Postmark inactive recipient
  expect(isHardRecipientFailure({ responseCode: 550 })).toBe(true);
  expect(isHardRecipientFailure({ responseCode: 553 })).toBe(true);
  expect(isHardRecipientFailure({ responseCode: 552 })).toBe(false); // mailbox full
  expect(isHardRecipientFailure({ responseCode: 554 })).toBe(false); // policy
  expect(isHardRecipientFailure({ code: 'ETIMEDOUT' })).toBe(false);
  expect(isHardRecipientFailure(undefined)).toBe(false);
});
