// The super_admin enquiry list through the real /admin router, against an
// in-memory Mongo and the real Redis the authenticate middleware uses.
import { jest } from '@jest/globals';

jest.unstable_mockModule('../services/audit.service.js', () => ({
  auditLog: jest.fn().mockResolvedValue(undefined),
  processAuditLog: jest.fn(),
}));

const { MongoMemoryServer } = await import('mongodb-memory-server');
const { default: mongoose } = await import('mongoose');
const { default: express } = await import('express');
const { default: request } = await import('supertest');
const { CollegeEnquiry } = await import('../models/CollegeEnquiry.js');
const { User } = await import('../models/User.js');
const { signAccessToken, hashPassword } = await import('../services/auth.service.js');
const { errorHandler } = await import('../middleware/errorHandler.js');
const { default: adminRouter } = await import('../routes/admin.js');
const { redis } = await import('../config/redis.js');

let mongod;
let app;
let user;
let rows;

const token = (extra = {}) => signAccessToken({ sub: String(user._id), ...extra });
const superToken = () => token({ systemRole: 'super_admin' });

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  user = await User.create({
    email: 'root@platform.test',
    username: 'root',
    usernameLower: 'root',
    passwordHash: await hashPassword('irrelevant-but-valid'),
    emailVerified: true,
    status: 'active',
  });
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
  await CollegeEnquiry.deleteMany({});
  const base = { email: 'tpo@college.test', phone: '+919876543210' };
  // Explicit times so "newest first" is not a tie inside one insert.
  const at = (day) => new Date(`2026-10-0${day}T10:00:00Z`);
  rows = await CollegeEnquiry.create([
    { ...base, contactName: 'Asha', collegeName: 'College A', createdAt: at(1) },
    {
      ...base,
      contactName: 'Bela',
      collegeName: 'College B',
      status: 'contacted',
      createdAt: at(2),
    },
    {
      ...base,
      contactName: 'Chitra',
      collegeName: 'College C',
      status: 'closed',
      createdAt: at(3),
    },
  ]);
});

const list = (query = '', tok = superToken()) =>
  request(app).get(`/admin/enquiries${query}`).set('Authorization', `Bearer ${tok}`);

describe('GET /admin/enquiries', () => {
  test('lists newest first with paging totals', async () => {
    const res = await list();
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(3);
    expect(res.body.enquiries.map((e) => e.collegeName)).toEqual([
      'College C',
      'College B',
      'College A',
    ]);
    expect(res.body.page).toBe(1);
  });

  test('filters by status and ignores an unknown one', async () => {
    expect((await list('?status=contacted')).body.enquiries).toHaveLength(1);
    expect((await list('?status=bogus')).body.total).toBe(3);
  });

  test('caps the page size', async () => {
    const res = await list('?limit=1&page=2');
    expect(res.body.enquiries).toHaveLength(1);
    expect(res.body.pages).toBe(3);
  });

  test('survives a negative or fractional page and limit', async () => {
    const res = await list('?limit=-5&page=2.7');
    expect(res.status).toBe(200);
    expect(res.body.pages).toBeGreaterThan(0);
    expect((await list('?limit=0&page=-1')).status).toBe(200);
  });

  test('is for the platform super admin only', async () => {
    expect((await request(app).get('/admin/enquiries')).status).toBe(401);
    expect((await list('', token())).status).toBe(403);
  });
});

describe('PATCH /admin/enquiries/:id', () => {
  const patch = (id, body, tok = superToken()) =>
    request(app).patch(`/admin/enquiries/${id}`).set('Authorization', `Bearer ${tok}`).send(body);

  test('moves the status and keeps a note', async () => {
    const res = await patch(rows[0]._id, { status: 'contacted', adminNote: 'Called on Monday' });
    expect(res.status).toBe(200);
    const doc = await CollegeEnquiry.findById(rows[0]._id).lean();
    expect(doc).toMatchObject({ status: 'contacted', adminNote: 'Called on Monday' });
  });

  test('rejects an unknown status', async () => {
    expect((await patch(rows[0]._id, { status: 'archived' })).status).toBe(400);
  });

  test('404 for a missing or malformed id', async () => {
    expect((await patch(new mongoose.Types.ObjectId(), { status: 'closed' })).status).toBe(404);
    expect((await patch('not-an-id', { status: 'closed' })).status).toBe(404);
  });

  test('is for the platform super admin only', async () => {
    expect((await patch(rows[0]._id, { status: 'closed' }, token())).status).toBe(403);
    expect((await CollegeEnquiry.findById(rows[0]._id).lean()).status).toBe('new');
  });
});
