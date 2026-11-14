// sendEmail records sent/failed/skipped rows and rethrows; stats group by IST day;
// the /admin routes are super_admin only. Monitoring connection = in-memory Mongo.
import { jest } from '@jest/globals';

const sendViaSmtp = jest.fn();
jest.unstable_mockModule('../services/email/smtpAdapter.js', () => ({
  createSmtpTransport: jest.fn(() => ({})),
  sendViaSmtp,
}));
jest.unstable_mockModule('../services/audit.service.js', () => ({
  auditLog: jest.fn(),
  processAuditLog: jest.fn(),
}));

// authenticate() only reads the revocation keys; no Redis needed for these tests.
jest.unstable_mockModule('../config/redis.js', () => ({
  redis: {
    get: jest.fn().mockResolvedValue(null),
    exists: jest.fn().mockResolvedValue(0),
    disconnect: jest.fn(),
  },
}));

const { MongoMemoryServer } = await import('mongodb-memory-server');
const { default: express } = await import('express');
const { default: request } = await import('supertest');
const { monitoringConnection } = await import('../config/monitoringDb.js');
const { EmailLog } = await import('../models/EmailLog.js');
const { sendEmail } = await import('../services/email.service.js');
const { classifyEmailError } = await import('../services/email/classifyEmailError.js');
const { getEmailStats } = await import('../services/emailLog.service.js');
const { signAccessToken } = await import('../services/auth.service.js');
const { errorHandler } = await import('../middleware/errorHandler.js');
const { default: adminRouter } = await import('../routes/admin.js');

let mongod;
let app;

// The fire-and-forget write has no promise to await; poll until it lands.
async function rowCount(n) {
  for (let i = 0; i < 50; i++) {
    if ((await EmailLog.countDocuments()) >= n) return;
    await new Promise((r) => setTimeout(r, 20));
  }
}

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await monitoringConnection.openUri(mongod.getUri());
  app = express();
  app.use('/admin', adminRouter);
  app.use(errorHandler);
});

afterAll(async () => {
  await monitoringConnection.close();
  await mongod.stop();
});

beforeEach(async () => {
  await EmailLog.deleteMany({});
  sendViaSmtp.mockReset();
});

const mail = { to: 'a@x.test', subject: 'Hi', html: '<p>x</p>', kind: 'verification' };

describe('sendEmail logging', () => {
  test('records a sent row with the message id', async () => {
    sendViaSmtp.mockResolvedValue({ messageId: 'm-1' });
    await sendEmail(mail);
    await rowCount(1);
    const row = await EmailLog.findOne().lean();
    expect(row).toMatchObject({
      status: 'sent',
      kind: 'verification',
      to: 'a@x.test',
      messageId: 'm-1',
    });
  });

  test('records a skipped row when the adapter did not send', async () => {
    sendViaSmtp.mockResolvedValue({ skipped: 'not_configured' });
    await sendEmail(mail);
    await rowCount(1);
    expect(await EmailLog.findOne().lean()).toMatchObject({
      status: 'skipped',
      reason: 'not_configured',
    });
  });

  test('records a failed row with the reason and rethrows the original error', async () => {
    const err = Object.assign(new Error('Daily user sending quota exceeded'), {
      code: 'EENVELOPE',
      responseCode: 550,
    });
    sendViaSmtp.mockRejectedValue(err);
    await expect(sendEmail(mail)).rejects.toBe(err);
    await rowCount(1);
    expect(await EmailLog.findOne().lean()).toMatchObject({
      status: 'failed',
      reason: 'rate_limit',
      errorCode: 'EENVELOPE',
      errorMessage: 'Daily user sending quota exceeded',
    });
  });
});

describe('classifyEmailError', () => {
  test.each([
    [{ statusCode: 429 }, 'rate_limit'],
    [{ responseCode: 451 }, 'rate_limit'],
    [{ code: 'EAUTH' }, 'auth'],
    [{ code: 'ETIMEDOUT' }, 'connection'],
    [{ code: '406', statusCode: 422 }, 'recipient_rejected'],
    [{ responseCode: 550, message: 'mailbox unavailable' }, 'recipient_rejected'],
    [new Error('boom'), 'other'],
  ])('%j -> %s', (err, reason) => {
    expect(classifyEmailError(err)).toBe(reason);
  });
});

describe('getEmailStats', () => {
  test('buckets by IST day, fills empty days and ranks failure reasons', async () => {
    const now = Date.parse('2026-11-14T10:00:00Z'); // 15:30 IST on the 14th
    await EmailLog.collection.insertMany([
      // 23:00 UTC on the 13th is 04:30 IST on the 14th -> counts for the 14th
      { at: new Date('2026-11-13T23:00:00Z'), status: 'sent', provider: 'smtp', to: 'a' },
      { at: new Date('2026-11-14T08:00:00Z'), status: 'sent', provider: 'smtp', to: 'a' },
      {
        at: new Date('2026-11-14T08:05:00Z'),
        status: 'failed',
        reason: 'rate_limit',
        provider: 'smtp',
        to: 'a',
      },
      {
        at: new Date('2026-11-14T08:06:00Z'),
        status: 'failed',
        reason: 'rate_limit',
        provider: 'smtp',
        to: 'a',
      },
      { at: new Date('2026-11-12T08:00:00Z'), status: 'skipped', provider: 'console', to: 'a' },
    ]);

    const s = await getEmailStats({ days: 3, now });

    expect(s.daily.map((d) => d.day)).toEqual(['2026-11-12', '2026-11-13', '2026-11-14']);
    expect(s.daily[0]).toMatchObject({ sent: 0, failed: 0, skipped: 1 });
    expect(s.daily[1]).toMatchObject({ sent: 0, failed: 0, skipped: 0 });
    expect(s.today).toMatchObject({ sent: 2, failed: 2 });
    expect(s.totals).toMatchObject({ sent: 2, failed: 2, skipped: 1, failureRate: 0.5 });
    expect(s.peakDay).toEqual({ day: '2026-11-14', sent: 2 });
    expect(s.reasons).toEqual([{ reason: 'rate_limit', count: 2 }]);
  });

  test('failureRate is null and peakDay null when nothing was attempted', async () => {
    const s = await getEmailStats({ days: 2 });
    expect(s.totals.failureRate).toBeNull();
    expect(s.peakDay).toBeNull();
  });
});

describe('/admin/email-logs', () => {
  const tok = (extra = {}) => signAccessToken({ sub: '64b000000000000000000001', ...extra });

  test('rejects non super_admin', async () => {
    const res = await request(app).get('/admin/email-logs').set('Authorization', `Bearer ${tok()}`);
    expect(res.status).toBe(403);
  });

  test('lists newest first and filters by status', async () => {
    await EmailLog.create([
      { provider: 'smtp', to: 'a', status: 'sent', kind: 'verification' },
      { provider: 'smtp', to: 'b', status: 'failed', reason: 'auth', kind: 'password-reset' },
    ]);
    const res = await request(app)
      .get('/admin/email-logs?status=failed')
      .set('Authorization', `Bearer ${tok({ systemRole: 'super_admin' })}`);
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.logs[0]).toMatchObject({ to: 'b', reason: 'auth' });
  });

  test('stats route returns the daily series', async () => {
    const res = await request(app)
      .get('/admin/email-logs/stats?days=7')
      .set('Authorization', `Bearer ${tok({ systemRole: 'super_admin' })}`);
    expect(res.status).toBe(200);
    expect(res.body.daily).toHaveLength(7);
  });
});
