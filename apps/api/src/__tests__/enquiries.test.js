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

// app.js runs the DOMPurify-based sanitizeBody before every route, which turns a typed
// `&`, `<` or `>` into an entity. It cannot be imported here (jsdom does not load under
// Jest, see orgTypeModuleGating.test.js), so this stand-in does just that escaping.
const escapeText = (v) =>
  typeof v === 'string'
    ? v.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    : v;
function escapeLikeSanitizer(req, _res, next) {
  req.body = Object.fromEntries(Object.entries(req.body).map(([k, v]) => [k, escapeText(v)]));
  next();
}

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  app = express();
  app.use(express.json());
  app.use(escapeLikeSanitizer);
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

  test('a filled honeypot looks just like a real success but stores nothing', async () => {
    const res = await request(app)
      .post('/enquiries')
      .send(body({ website: 'http://spam.test' }));
    expect(res.status).toBe(201);
    expect(mongoose.isValidObjectId(res.body.id)).toBe(true);
    expect(await CollegeEnquiry.countDocuments()).toBe(0);
  });

  test('a very long honeypot value is not a tell: still a quiet success', async () => {
    const res = await request(app)
      .post('/enquiries')
      .send(body({ website: 'x'.repeat(5000) }));
    expect(res.status).toBe(201);
    expect(await CollegeEnquiry.countDocuments()).toBe(0);
  });

  test('keeps an ampersand as typed instead of storing it HTML-escaped', async () => {
    const res = await request(app)
      .post('/enquiries')
      .send(body({ collegeName: 'Arts & Science College', message: 'We have <60 students' }));
    expect(res.status).toBe(201);
    const doc = await CollegeEnquiry.findById(res.body.id).lean();
    expect(doc.collegeName).toBe('Arts & Science College');
    expect(doc.message).toBe('We have <60 students');
  });

  test('does not decode twice: a typed entity stays a typed entity', async () => {
    const res = await request(app)
      .post('/enquiries')
      .send(body({ message: 'write &lt;b&gt; for bold' }));
    const doc = await CollegeEnquiry.findById(res.body.id).lean();
    expect(doc.message).toBe('write &lt;b&gt; for bold');
  });
});
