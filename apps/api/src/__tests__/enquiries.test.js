// The public POST /enquiries route through a mini Express app (the full app.js
// cannot load under Jest) against an in-memory Mongo.
const { MongoMemoryServer } = await import('mongodb-memory-server');
const { default: mongoose } = await import('mongoose');
const { default: express } = await import('express');
const { default: request } = await import('supertest');
const { CollegeEnquiry } = await import('../models/CollegeEnquiry.js');
const { errorHandler } = await import('../middleware/errorHandler.js');
const { default: enquiriesRouter } = await import('../routes/enquiries.js');

let mongod;
let app;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  app = express();
  app.use(express.json());
  app.use('/enquiries', enquiriesRouter);
  app.use(errorHandler);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

beforeEach(() => CollegeEnquiry.deleteMany({}));

const body = (patch = {}) => ({
  contactName: 'Meena Joshi',
  collegeName: 'Khatima Degree College',
  email: 'tpo@college.test',
  phone: '+91 98765 43210',
  programme: 'career_ready',
  message: 'We have 60 BCA students.',
  ...patch,
});

describe('POST /enquiries', () => {
  test('stores a valid enquiry as new, with no sign-in and no tenant', async () => {
    const res = await request(app).post('/enquiries').send(body());
    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    const doc = await CollegeEnquiry.findById(res.body.id).lean();
    expect(doc).toMatchObject({
      contactName: 'Meena Joshi',
      collegeName: 'Khatima Degree College',
      phone: '+919876543210',
      programme: 'career_ready',
      status: 'new',
    });
    expect(doc.tenantId).toBeUndefined();
  });

  test.each([
    ['missing college', { collegeName: undefined }],
    ['missing phone', { phone: undefined }],
    ['bad email', { email: 'nope' }],
    ['bad phone', { phone: '123' }],
    ['unknown programme', { programme: 'gold' }],
    ['unknown field', { status: 'closed' }],
  ])('rejects %s with 400 and stores nothing', async (_l, patch) => {
    const res = await request(app).post('/enquiries').send(body(patch));
    expect(res.status).toBe(400);
    expect(await CollegeEnquiry.countDocuments()).toBe(0);
  });

  test('a filled honeypot looks accepted but stores nothing', async () => {
    const res = await request(app)
      .post('/enquiries')
      .send(body({ website: 'http://spam.test' }));
    expect(res.status).toBe(201);
    expect(await CollegeEnquiry.countDocuments()).toBe(0);
  });
});
