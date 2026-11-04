// Drives POST/PATCH/GET /academic/students through a mini Express app against an
// in-memory Mongo and the real Redis the permission cache uses.
import { jest } from '@jest/globals';

const auditLog = jest.fn().mockResolvedValue(undefined);
jest.unstable_mockModule('../services/audit.service.js', () => ({
  auditLog,
  processAuditLog: jest.fn(),
}));

const uploadBuffer = jest.fn().mockResolvedValue(undefined);
jest.unstable_mockModule('../services/storage.service.js', () => ({
  uploadBuffer,
  getSignedUrl: jest.fn().mockResolvedValue('https://files.test/doc.pdf'),
  deleteObject: jest.fn().mockResolvedValue(undefined),
}));

const { MongoMemoryServer } = await import('mongodb-memory-server');
const { default: mongoose } = await import('mongoose');
const { default: express } = await import('express');
const { default: request } = await import('supertest');
const { Tenant } = await import('../models/Tenant.js');
const { Role, DEFAULT_ROLE_TEMPLATES } = await import('../models/Role.js');
const { User } = await import('../models/User.js');
const { Student } = await import('../models/Student.js');
const { Class } = await import('../models/Class.js');
const { Section } = await import('../models/Section.js');
const { Enrollment } = await import('../models/Enrollment.js');
const { TenantMembership } = await import('../models/TenantMembership.js');
const { default: academicRouter } = await import('../routes/academic.js');
const { default: meRouter } = await import('../routes/me.js');
const { signAccessToken, hashPassword } = await import('../services/auth.service.js');
const { errorHandler } = await import('../middleware/errorHandler.js');
const { decryptField } = await import('../utils/fieldEncryption.js');
const { redis } = await import('../config/redis.js');

const AADHAAR = '234567890124';

let mongod;
let app;
const tenants = {};
const roles = {};
const tokens = {};
const sections = {};
const users = {};
let n = 0;

async function makeTenant(subdomain, orgType) {
  const tenant = await Tenant.create({ name: subdomain, subdomain, orgType });
  const made = {};
  for (const [key, permissions] of Object.entries(DEFAULT_ROLE_TEMPLATES)) {
    made[key] = await Role.create({
      tenantId: tenant._id,
      name: key,
      templateKey: key,
      permissions,
    });
  }
  const klass = await Class.create({ tenantId: tenant._id, name: 'Grade 5' });
  const section = await Section.create({ tenantId: tenant._id, classId: klass._id, name: 'A' });
  return { tenant, roles: made, section };
}

async function makeMember(tenant, role, label) {
  n += 1;
  const user = await User.create({
    email: `${label}${n}@school.test`,
    username: `${label}-${n}`,
    usernameLower: `${label}-${n}`,
    passwordHash: await hashPassword('irrelevant-but-valid'),
    emailVerified: true,
    status: 'active',
  });
  await TenantMembership.create({
    tenantId: tenant._id,
    userId: user._id,
    roleIds: [role._id],
    status: 'active',
  });
  users[label] = user;
  return signAccessToken({ sub: user._id.toString() });
}

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  await Student.syncIndexes();

  for (const [key, subdomain, orgType] of [
    ['school', 'school-a', 'school'],
    ['other', 'school-b', 'school'],
    ['study', 'study-a', 'study_center'],
    ['college', 'college-a', 'college'],
  ]) {
    const made = await makeTenant(subdomain, orgType);
    tenants[key] = made.tenant;
    roles[key] = made.roles;
    sections[key] = made.section;
  }
  tokens.admin = await makeMember(tenants.school, roles.school.tenant_admin, 'admin');
  tokens.teacher = await makeMember(tenants.school, roles.school.teacher, 'teacher');
  tokens.pupil = await makeMember(tenants.school, roles.school.student, 'pupil');
  tokens.otherAdmin = await makeMember(tenants.other, roles.other.tenant_admin, 'oadmin');
  tokens.studyAdmin = await makeMember(tenants.study, roles.study.tenant_admin, 'sadmin');
  tokens.collegeAdmin = await makeMember(tenants.college, roles.college.tenant_admin, 'cadmin');

  app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.tenant = tenants[req.headers['x-tenant'] ?? 'school'];
    next();
  });
  app.use('/academic', academicRouter);
  app.use('/me', meRouter);
  app.use(errorHandler);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
  redis.disconnect();
});

const call = (method, path, who, body, tenant = 'school') => {
  const req = request(app)[method](path).set('x-tenant', tenant);
  if (who) req.set('Authorization', `Bearer ${tokens[who]}`);
  return body === undefined ? req : req.send(body);
};

const base = (no, extra = {}) => ({
  admissionNo: no,
  firstName: 'Asha',
  lastName: 'Rao',
  ...extra,
});

const raw = (id) => Student.collection.findOne({ _id: new mongoose.Types.ObjectId(id) });

describe('POST /academic/students', () => {
  test('stores the new profile fields', async () => {
    const res = await call('post', '/academic/students', 'admin', {
      ...base('P-001'),
      phone: '+91 98765 43210',
      whatsappNumber: '9876543211',
      admissionDate: '2024-04-01',
      bloodGroup: 'O+',
      allergies: 'Peanuts',
      medicalNotes: 'Asthma',
      address: { line1: '1 Main Rd', city: 'Pune', state: 'MH', pincode: '411001' },
      parentContacts: [
        {
          name: 'Ravi',
          relation: 'father',
          phone: '9876543212',
          email: 'Ravi@Example.com',
          whatsappSameAsPhone: true,
          isPrimary: true,
          isEmergency: true,
        },
      ],
      category: 'obc',
      transportRoute: 'R4',
    });
    expect(res.status).toBe(201);
    const saved = await Student.findById(res.body._id).lean();
    expect(saved).toMatchObject({
      phone: '9876543210',
      whatsappNumber: '9876543211',
      bloodGroup: 'O+',
      allergies: 'Peanuts',
      medicalNotes: 'Asthma',
      category: 'obc',
      transportRoute: 'R4',
      address: { line1: '1 Main Rd', city: 'Pune', state: 'MH', pincode: '411001' },
    });
    expect(saved.admissionDate.toISOString().slice(0, 10)).toBe('2024-04-01');
    expect(saved.parentContacts[0]).toMatchObject({
      name: 'Ravi',
      phone: '9876543212',
      email: 'ravi@example.com',
      whatsappSameAsPhone: true,
      isPrimary: true,
      isEmergency: true,
    });
  });

  test('a bad phone is a 400 carrying the message', async () => {
    const res = await call('post', '/academic/students', 'admin', base('P-002', { phone: '123' }));
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Enter a valid 10-digit mobile number');
  });

  test('rejects fields the caller must not set, and fields of another org type', async () => {
    const hostile = { userId: String(new mongoose.Types.ObjectId()), kind: 'walk_in' };
    for (const [i, extra] of [hostile, { examTarget: 'NEET' }, { status: 'withdrawn' }].entries()) {
      const res = await call('post', '/academic/students', 'admin', base(`P-00${3 + i}`, extra));
      expect(res.status).toBe(400);
    }
  });

  test('keeps the duplicate admission number conflict', async () => {
    await call('post', '/academic/students', 'admin', base('P-010'));
    const res = await call('post', '/academic/students', 'admin', base('P-010'));
    expect(res.status).toBe(409);
  });

  test('a batch-style org accepts its own fields; a school does not', async () => {
    const ok = await call(
      'post',
      '/academic/students',
      'studyAdmin',
      base('S-001', { examTarget: 'UPSC', joiningSource: 'Referral' }),
      'study'
    );
    expect(ok.status).toBe(201);
    expect((await Student.findById(ok.body._id).lean()).examTarget).toBe('UPSC');
    const no = await call(
      'post',
      '/academic/students',
      'studyAdmin',
      base('S-002', { category: 'obc' }),
      'study'
    );
    expect(no.status).toBe(400);
  });

  test('a college accepts college fields', async () => {
    const res = await call(
      'post',
      '/academic/students',
      'collegeAdmin',
      base('C-001', {
        college: 'ABC Institute',
        branch: 'CSE',
        graduationYear: 2027,
        skills: ['SQL'],
      }),
      'college'
    );
    expect(res.status).toBe(201);
    expect(await Student.findById(res.body._id).lean()).toMatchObject({
      college: 'ABC Institute',
      graduationYear: 2027,
      skills: ['SQL'],
    });
  });

  test('a section from another tenant is refused', async () => {
    const res = await call(
      'post',
      '/academic/students',
      'admin',
      base('P-011', { sectionId: String(sections.other._id) })
    );
    expect(res.status).toBe(404);
    expect(
      await Student.countDocuments({ tenantId: tenants.school._id, admissionNo: 'P-011' })
    ).toBe(0);
  });

  test('a section of this tenant enrolls the student', async () => {
    const res = await call(
      'post',
      '/academic/students',
      'admin',
      base('P-012', { sectionId: String(sections.school._id) })
    );
    expect(res.status).toBe(201);
    expect(await Enrollment.countDocuments({ studentId: res.body._id, status: 'active' })).toBe(1);
  });

  test('needs students:write', async () => {
    expect((await call('post', '/academic/students', 'teacher', base('P-013'))).status).toBe(403);
  });
});

describe('student login on create', () => {
  test('an email gives the student a claimable login', async () => {
    const res = await call(
      'post',
      '/academic/students',
      'admin',
      base('E-001', { email: 'Asha.E1@School.test' })
    );
    expect(res.status).toBe(201);
    expect(res.body.account).toEqual({ email: 'asha.e1@school.test', status: 'pending_claim' });
    const saved = await Student.findById(res.body._id).lean();
    expect(saved.userId).toBeTruthy();
    const user = await User.findById(saved.userId).lean();
    expect(user).toMatchObject({ email: 'asha.e1@school.test', status: 'pending_claim' });
  });

  test('no email means no user', async () => {
    const res = await call('post', '/academic/students', 'admin', base('E-002'));
    expect(res.status).toBe(201);
    expect(res.body.account).toBeUndefined();
    expect((await Student.findById(res.body._id).lean()).userId).toBeUndefined();
  });

  test('an email already linked to another student still creates the student', async () => {
    await call('post', '/academic/students', 'admin', base('E-003', { email: 'twin@school.test' }));
    const res = await call(
      'post',
      '/academic/students',
      'admin',
      base('E-004', { email: 'twin@school.test' })
    );
    expect(res.status).toBe(201);
    expect(res.body.account).toBeUndefined();
    expect(res.body.loginError).toMatch(/already linked/);
    expect(
      await Student.countDocuments({ tenantId: tenants.school._id, admissionNo: 'E-004' })
    ).toBe(1);
  });

  test('an invalid email is a 400 and creates nothing', async () => {
    const res = await call('post', '/academic/students', 'admin', base('E-005', { email: 'nope' }));
    expect(res.status).toBe(400);
    expect(
      await Student.countDocuments({ tenantId: tenants.school._id, admissionNo: 'E-005' })
    ).toBe(0);
  });
});

describe('PATCH /academic/students/:id', () => {
  const make = (no, extra) =>
    Student.create({ tenantId: tenants.school._id, ...base(no), ...extra });

  test('cannot change identity or ownership fields', async () => {
    const s = await make('U-001');
    for (const body of [
      { admissionNo: 'U-999' },
      { userId: String(new mongoose.Types.ObjectId()) },
      { tenantId: String(tenants.other._id) },
      { kind: 'walk_in' },
      { aadhaarEnc: 'x' },
      { placementConsent: { granted: true } },
    ]) {
      expect((await call('patch', `/academic/students/${s._id}`, 'admin', body)).status).toBe(400);
    }
    const after = await Student.findById(s._id).lean();
    expect(after).toMatchObject({ admissionNo: 'U-001' });
    expect(String(after.tenantId)).toBe(String(tenants.school._id));
  });

  test('updates profile fields and replaces the guardian list', async () => {
    const s = await make('U-002', { phone: '9876543210' });
    const res = await call('patch', `/academic/students/${s._id}`, 'admin', {
      whatsappNumber: '9876543299',
      bloodGroup: 'A-',
      address: { city: 'Pune', pincode: '411001' },
      parentContacts: [{ name: 'Ravi', phone: '9876543212', isPrimary: true }],
    });
    expect(res.status).toBe(200);
    expect(await Student.findById(s._id).lean()).toMatchObject({
      whatsappNumber: '9876543299',
      bloodGroup: 'A-',
      address: { city: 'Pune', pincode: '411001' },
      parentContacts: [expect.objectContaining({ name: 'Ravi', isPrimary: true })],
    });
  });

  test('a blank value clears the field', async () => {
    const s = await make('U-003', { phone: '9876543210', bloodGroup: 'O+', gender: 'female' });
    const res = await call('patch', `/academic/students/${s._id}`, 'admin', {
      phone: '',
      bloodGroup: '',
      gender: '',
    });
    expect(res.status).toBe(200);
    const after = await raw(String(s._id));
    expect(after.phone).toBeUndefined();
    expect(after.bloodGroup).toBeUndefined();
    expect(after.gender).toBeUndefined();
  });

  test('whatsappSameAsPhone needs a phone on the record', async () => {
    const without = await make('U-004');
    const bad = await call('patch', `/academic/students/${without._id}`, 'admin', {
      whatsappSameAsPhone: true,
    });
    expect(bad.status).toBe(400);
    expect(bad.body.error).toBe('Add a phone number first');

    const withPhone = await make('U-005', { phone: '9876543210' });
    const ok = await call('patch', `/academic/students/${withPhone._id}`, 'admin', {
      whatsappSameAsPhone: true,
    });
    expect(ok.status).toBe(200);

    const clearing = await call('patch', `/academic/students/${withPhone._id}`, 'admin', {
      phone: '',
    });
    expect(clearing.status).toBe(400);
  });

  test('a status change records when and why; going back to active clears the reason', async () => {
    const s = await make('U-006');
    const out = await call('patch', `/academic/students/${s._id}`, 'admin', {
      status: 'withdrawn',
      statusReason: 'Moved city',
    });
    expect(out.status).toBe(200);
    const withdrawn = await Student.findById(s._id).lean();
    expect(withdrawn).toMatchObject({ status: 'withdrawn', statusReason: 'Moved city' });
    expect(withdrawn.statusChangedAt).toBeInstanceOf(Date);

    const back = await call('patch', `/academic/students/${s._id}`, 'admin', { status: 'active' });
    expect(back.status).toBe(200);
    const active = await raw(String(s._id));
    expect(active.status).toBe('active');
    expect(active.statusReason).toBeUndefined();
    expect(active.statusChangedAt.getTime()).toBeGreaterThanOrEqual(
      withdrawn.statusChangedAt.getTime()
    );
  });

  test('a reason is optional, and re-sending the same status does not move the date', async () => {
    const s = await make('U-007');
    await call('patch', `/academic/students/${s._id}`, 'admin', { status: 'graduated' });
    const first = await Student.findById(s._id).lean();
    expect(first.statusReason).toBeUndefined();
    await call('patch', `/academic/students/${s._id}`, 'admin', { status: 'graduated' });
    const second = await Student.findById(s._id).lean();
    expect(second.statusChangedAt.getTime()).toBe(first.statusChangedAt.getTime());
  });

  test('moving to a section enrolls, and a foreign section is refused', async () => {
    const s = await make('U-008');
    const ok = await call('patch', `/academic/students/${s._id}`, 'admin', {
      sectionId: String(sections.school._id),
    });
    expect(ok.status).toBe(200);
    expect(await Enrollment.countDocuments({ studentId: s._id, status: 'active' })).toBe(1);

    const foreign = await call('patch', `/academic/students/${s._id}`, 'admin', {
      sectionId: String(sections.other._id),
    });
    expect(foreign.status).toBe(404);
    expect(String((await Student.findById(s._id).lean()).sectionId)).toBe(
      String(sections.school._id)
    );
  });

  test("another tenant's student is not found, and a read-only role is refused", async () => {
    const s = await make('U-009');
    expect(
      (
        await call(
          'patch',
          `/academic/students/${s._id}`,
          'otherAdmin',
          { bloodGroup: 'O+' },
          'other'
        )
      ).status
    ).toBe(404);
    expect(
      (await call('patch', `/academic/students/${s._id}`, 'teacher', { bloodGroup: 'O+' })).status
    ).toBe(403);
  });

  test('the old fields still work (name, section, guardian, status)', async () => {
    const s = await make('U-010');
    const res = await call('patch', `/academic/students/${s._id}`, 'admin', {
      firstName: 'Anya',
      parentContacts: [{ name: 'Mira', phone: '9876543213', relation: 'mother' }],
    });
    expect(res.status).toBe(200);
    expect(res.body.firstName).toBe('Anya');
  });
});

describe('Aadhaar', () => {
  test('is stored encrypted with its last four digits, and never returned', async () => {
    const res = await call(
      'post',
      '/academic/students',
      'admin',
      base('A-001', { aadhaar: AADHAAR })
    );
    expect(res.status).toBe(201);
    expect(JSON.stringify(res.body)).not.toContain(AADHAAR);
    expect(res.body.aadhaarEnc).toBeUndefined();
    expect(res.body.aadhaarLast4).toBe('0124');

    const stored = await Student.findById(res.body._id).select('+aadhaarEnc').lean();
    expect(stored.aadhaarEnc).toBeTruthy();
    expect(stored.aadhaarEnc).not.toContain(AADHAAR);
    expect(decryptField(stored.aadhaarEnc, tenants.school._id)).toBe(AADHAAR);
    expect(stored.aadhaarLast4).toBe('0124');

    const list = await call('get', '/academic/students?limit=100', 'admin');
    expect(JSON.stringify(list.body)).not.toContain(AADHAAR);
    expect(JSON.stringify(list.body)).not.toContain('aadhaarEnc');
    const detail = await call('get', `/academic/students/${res.body._id}`, 'admin');
    expect(detail.body.aadhaarEnc).toBeUndefined();
    expect(detail.body.aadhaarLast4).toBe('0124');
  });

  test('a bad checksum is a 400', async () => {
    const res = await call(
      'post',
      '/academic/students',
      'admin',
      base('A-002', { aadhaar: '234567890125' })
    );
    expect(res.status).toBe(400);
  });

  test('can be set, replaced and cleared by an update, and the response hides it', async () => {
    const s = await Student.create({ tenantId: tenants.school._id, ...base('A-003') });
    const set = await call('patch', `/academic/students/${s._id}`, 'admin', { aadhaar: AADHAAR });
    expect(set.status).toBe(200);
    expect(JSON.stringify(set.body)).not.toContain(AADHAAR);
    expect(set.body.aadhaarLast4).toBe('0124');
    const stored = await Student.findById(s._id).select('+aadhaarEnc').lean();
    expect(decryptField(stored.aadhaarEnc, tenants.school._id)).toBe(AADHAAR);

    const cleared = await call('patch', `/academic/students/${s._id}`, 'admin', { aadhaar: '' });
    expect(cleared.status).toBe(200);
    const after = await raw(String(s._id));
    expect(after.aadhaarEnc).toBeUndefined();
    expect(after.aadhaarLast4).toBeUndefined();
  });

  test('another tenant cannot decrypt it', async () => {
    const res = await call(
      'post',
      '/academic/students',
      'admin',
      base('A-004', { aadhaar: AADHAAR })
    );
    const stored = await Student.findById(res.body._id).select('+aadhaarEnc').lean();
    let leaked;
    try {
      leaked = decryptField(stored.aadhaarEnc, tenants.other._id);
    } catch {
      leaked = undefined;
    }
    expect(leaked).not.toBe(AADHAAR);
  });
});

describe('existing rows and reads', () => {
  test('a student saved before these fields still reads back', async () => {
    const old = await Student.collection.insertOne({
      tenantId: tenants.school._id,
      admissionNo: 'OLD-1',
      firstName: 'Old',
      lastName: 'Row',
      parentContacts: [{ name: 'Parent', phone: '9876543210', relation: 'parent' }],
      status: 'active',
    });
    const res = await call('get', `/academic/students/${old.insertedId}`, 'admin');
    expect(res.status).toBe(200);
    expect(res.body.parentContacts[0].name).toBe('Parent');
    expect(res.body.address).toBeUndefined();
  });

  test('a read-only role can read, another tenant cannot', async () => {
    const s = await Student.create({ tenantId: tenants.school._id, ...base('R-001') });
    expect((await call('get', `/academic/students/${s._id}`, 'teacher')).status).toBe(200);
    expect(
      (await call('get', `/academic/students/${s._id}`, 'otherAdmin', undefined, 'other')).status
    ).toBe(404);
  });
});

describe("a student's own view (/me/profile)", () => {
  test('shows the basics and none of the private profile fields', async () => {
    await Student.create({
      tenantId: tenants.school._id,
      userId: users.pupil._id,
      ...base('ME-1'),
      phone: '9876543210',
      address: { line1: '1 Main Rd', city: 'Pune', pincode: '411001' },
      bloodGroup: 'O+',
      allergies: 'Peanuts',
      medicalNotes: 'Asthma',
      aadhaarEnc: 'ciphertext',
      aadhaarLast4: '0124',
      category: 'obc',
      parentContacts: [{ name: 'Ravi', phone: '9876543212', email: 'ravi@example.com' }],
    });
    const res = await call('get', '/me/profile', 'pupil');
    expect(res.status).toBe(200);
    expect(res.body.isStudent).toBe(true);
    expect(res.body.student).toMatchObject({ admissionNo: 'ME-1', firstName: 'Asha' });
    for (const key of [
      'address',
      'bloodGroup',
      'allergies',
      'medicalNotes',
      'aadhaarEnc',
      'aadhaarLast4',
      'category',
      'parentContacts',
      'phone',
    ]) {
      expect(res.body.student).not.toHaveProperty(key);
    }
  });
});

describe('who sees the last four Aadhaar digits', () => {
  test('a role that can edit students does; a read-only role does not', async () => {
    const s = await Student.create({
      tenantId: tenants.school._id,
      ...base('AL-1'),
      aadhaarEnc: 'ciphertext',
      aadhaarLast4: '0124',
    });
    const asAdmin = await call('get', `/academic/students/${s._id}`, 'admin');
    expect(asAdmin.body.aadhaarLast4).toBe('0124');
    const asTeacher = await call('get', `/academic/students/${s._id}`, 'teacher');
    expect(asTeacher.status).toBe(200);
    expect(asTeacher.body).not.toHaveProperty('aadhaarLast4');

    const list = await call('get', '/academic/students?limit=100&search=AL-1', 'teacher');
    expect(list.status).toBe(200);
    expect(JSON.stringify(list.body)).not.toContain('aadhaarLast4');
    const adminList = await call('get', '/academic/students?limit=100&search=AL-1', 'admin');
    expect(adminList.body.students.find((x) => x.admissionNo === 'AL-1').aadhaarLast4).toBe('0124');
  });
});

describe('POST /academic/students/import', () => {
  const upload = (csv, who = 'admin', tenant = 'school') =>
    request(app)
      .post('/academic/students/import')
      .set('x-tenant', tenant)
      .set('Authorization', `Bearer ${tokens[who]}`)
      .attach('file', Buffer.from(csv), 'students.csv');
  const find = (no) => Student.findOne({ tenantId: tenants.school._id, admissionNo: no }).lean();

  test('a file with only the original columns imports as before', async () => {
    const res = await upload(
      'admissionNo,firstName,lastName,gender,dateOfBirth\n' +
        'IMP-1,John,Doe,male,2015-06-15\nIMP-2,Mary,Smith,female,2015-09-22\n'
    );
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ created: 2, skipped: 0, errors: [] });
    expect(await find('IMP-1')).toMatchObject({ firstName: 'John', gender: 'male' });
  });

  test('stores phone, whatsapp, guardian, address and admission date', async () => {
    const res = await upload(
      'admissionNo,firstName,lastName,phone,whatsapp,admissionDate,city,pincode,' +
        'guardianName,guardianPhone,guardianRelation,guardianEmail,guardianWhatsapp\n' +
        'IMP-3,Asha,Rao,+91 98765 43210,same,2024-04-01,Pune,411001,' +
        'Ravi Rao,9876543212,father,ravi@example.com,9876543299\n'
    );
    expect(res.body).toMatchObject({ created: 1, errors: [] });
    const s = await find('IMP-3');
    expect(s).toMatchObject({
      phone: '9876543210',
      whatsappSameAsPhone: true,
      address: { city: 'Pune', pincode: '411001' },
    });
    expect(s.admissionDate.toISOString().slice(0, 10)).toBe('2024-04-01');
    expect(s.parentContacts[0]).toMatchObject({
      name: 'Ravi Rao',
      phone: '9876543212',
      relation: 'father',
      email: 'ravi@example.com',
      whatsappNumber: '9876543299',
      isPrimary: true,
    });
  });

  test('the older parentName / parentPhone columns now store the guardian', async () => {
    await upload(
      'admissionNo,firstName,lastName,parentName,parentPhone,parentRelation\n' +
        'IMP-4,Tom,Smith,Jane Smith,9876543210,mother\n'
    );
    expect((await find('IMP-4')).parentContacts[0]).toMatchObject({
      name: 'Jane Smith',
      phone: '9876543210',
      relation: 'mother',
    });
  });

  test('a bad number fails that row only, and names the column', async () => {
    const res = await upload(
      'admissionNo,firstName,lastName,phone\nIMP-5,Good,Row,9876543210\nIMP-6,Bad,Row,123\n'
    );
    expect(res.body.created).toBe(1);
    expect(res.body.errors).toHaveLength(1);
    expect(res.body.errors[0].reason).toBe('phone: Enter a valid 10-digit mobile number');
    expect(await find('IMP-5')).toBeTruthy();
    expect(await find('IMP-6')).toBeNull();
  });

  test('a missing required field and a duplicate admission number keep their behaviour', async () => {
    await upload('admissionNo,firstName,lastName\nIMP-7,A,B\n');
    const res = await upload('admissionNo,firstName,lastName\nIMP-7,A,B\n,NoNumber,X\n');
    expect(res.body.skipped).toBe(1);
    expect(res.body.errors.map((e) => e.reason)).toEqual(['Missing required fields']);
  });

  test('the section column (a name) and the email column (a login) still work', async () => {
    const res = await upload(
      'admissionNo,firstName,lastName,sectionId,email\nIMP-8,Sec,Mail,A,Imp.Eight@School.test\n'
    );
    expect(res.body).toMatchObject({ created: 1, accountsProvisioned: 1 });
    const s = await find('IMP-8');
    expect(String(s.sectionId)).toBe(String(sections.school._id));
    expect(s.userId).toBeTruthy();
  });

  test('an Aadhaar column is ignored, never stored', async () => {
    await upload('admissionNo,firstName,lastName,aadhaar\nIMP-9,No,Aadhaar,234567890124\n');
    const s = await Student.findOne({ tenantId: tenants.school._id, admissionNo: 'IMP-9' })
      .select('+aadhaarEnc')
      .lean();
    expect(s.aadhaarEnc).toBeUndefined();
    expect(s.aadhaarLast4).toBeUndefined();
  });

  test('needs students:write', async () => {
    expect((await upload('admissionNo,firstName,lastName\nIMP-10,A,B\n', 'teacher')).status).toBe(
      403
    );
  });
});

describe('student documents carry a type', () => {
  const send = (id, fields = {}, who = 'admin') => {
    const req = request(app)
      .post(`/academic/students/${id}/documents`)
      .set('x-tenant', 'school')
      .set('Authorization', `Bearer ${tokens[who]}`)
      .attach('file', Buffer.from('%PDF-1.4 test'), 'cv.pdf');
    for (const [k, v] of Object.entries(fields)) req.field(k, v);
    return req;
  };
  const make = (no) => Student.create({ tenantId: tenants.school._id, ...base(no) });

  beforeEach(() => uploadBuffer.mockClear());

  test('a resume is stored as one, and the name defaults to the file name', async () => {
    const s = await make('DOC-1');
    const res = await send(s._id, { kind: 'resume' });
    expect(res.status).toBe(200);
    expect(res.body.document).toMatchObject({ name: 'cv.pdf', kind: 'resume' });
    expect((await Student.findById(s._id).lean()).documents[0].kind).toBe('resume');
  });

  test('no type means "other", which is what existing uploads did', async () => {
    const s = await make('DOC-2');
    const res = await send(s._id, { name: 'Birth certificate' });
    expect(res.body.document).toMatchObject({ name: 'Birth certificate', kind: 'other' });
  });

  test('an unknown type is refused before anything is uploaded or stored', async () => {
    const s = await make('DOC-3');
    const res = await send(s._id, { kind: 'virus' });
    expect(res.status).toBe(400);
    expect(uploadBuffer).not.toHaveBeenCalled();
    expect((await Student.findById(s._id).lean()).documents ?? []).toHaveLength(0);
  });

  test('needs students:write', async () => {
    const s = await make('DOC-4');
    expect((await send(s._id, { kind: 'resume' }, 'teacher')).status).toBe(403);
  });

  test('a document saved before types existed still downloads and has no type', async () => {
    const old = await Student.collection.insertOne({
      tenantId: tenants.school._id,
      admissionNo: 'DOC-OLD',
      firstName: 'Old',
      lastName: 'Docs',
      documents: [{ name: 'tc.pdf', key: 'students/x/tc.pdf', uploadedAt: new Date() }],
    });
    const detail = await call('get', `/academic/students/${old.insertedId}`, 'admin');
    expect(detail.body.documents[0].kind).toBeUndefined();
    const dl = await call(
      'get',
      `/academic/students/${old.insertedId}/documents/0/download`,
      'admin'
    );
    expect(dl.body.url).toBe('https://files.test/doc.pdf');
  });
});

describe('GET /academic/students/:id/aadhaar (reveal)', () => {
  const withAadhaar = async (no, tenant = tenants.school) => {
    const res = await call(
      'post',
      '/academic/students',
      tenant === tenants.school ? 'admin' : 'otherAdmin',
      base(no, { aadhaar: AADHAAR }),
      tenant === tenants.school ? 'school' : 'other'
    );
    return res.body._id;
  };

  beforeEach(() => auditLog.mockClear());

  test('returns the full number to someone who may edit students, and audits the read', async () => {
    const id = await withAadhaar('RV-1');
    auditLog.mockClear();
    const res = await call('get', `/academic/students/${id}/aadhaar`, 'admin');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ aadhaar: AADHAAR });
    expect(res.headers['cache-control']).toMatch(/no-store/);
    expect(auditLog).toHaveBeenCalledTimes(1);
    const entry = auditLog.mock.calls[0][0];
    expect(entry).toMatchObject({
      action: 'student.aadhaar_revealed',
      tenantId: String(tenants.school._id),
      target: { model: 'Student', id: expect.anything() },
    });
    // The number itself must never reach the audit log.
    expect(JSON.stringify(entry)).not.toContain(AADHAAR);
  });

  test('a read-only role is refused and nothing is audited', async () => {
    const id = await withAadhaar('RV-2');
    auditLog.mockClear();
    const res = await call('get', `/academic/students/${id}/aadhaar`, 'teacher');
    expect(res.status).toBe(403);
    expect(JSON.stringify(res.body)).not.toContain(AADHAAR);
    expect(auditLog).not.toHaveBeenCalled();
  });

  test('a student with no Aadhaar saved is a 404, with no audit entry', async () => {
    const s = await Student.create({ tenantId: tenants.school._id, ...base('RV-3') });
    auditLog.mockClear();
    const res = await call('get', `/academic/students/${s._id}/aadhaar`, 'admin');
    expect(res.status).toBe(404);
    expect(auditLog).not.toHaveBeenCalled();
  });

  test("another tenant's admin cannot reach it", async () => {
    const id = await withAadhaar('RV-4');
    const res = await call(
      'get',
      `/academic/students/${id}/aadhaar`,
      'otherAdmin',
      undefined,
      'other'
    );
    expect(res.status).toBe(404);
    expect(JSON.stringify(res.body)).not.toContain(AADHAAR);
  });

  test('setting and clearing it are audited, without the number', async () => {
    const s = await Student.create({ tenantId: tenants.school._id, ...base('RV-5') });
    auditLog.mockClear();
    await call('patch', `/academic/students/${s._id}`, 'admin', { aadhaar: AADHAAR });
    await call('patch', `/academic/students/${s._id}`, 'admin', { aadhaar: '' });
    const actions = auditLog.mock.calls.map(([e]) => e.action);
    expect(actions).toEqual(['student.aadhaar_set', 'student.aadhaar_cleared']);
    expect(JSON.stringify(auditLog.mock.calls)).not.toContain(AADHAAR);
  });

  test('entering it when the student is created is audited too', async () => {
    auditLog.mockClear();
    await call('post', '/academic/students', 'admin', base('RV-7', { aadhaar: AADHAAR }));
    expect(auditLog.mock.calls.map(([e]) => e.action)).toEqual(['student.aadhaar_set']);
    expect(JSON.stringify(auditLog.mock.calls)).not.toContain(AADHAAR);
  });

  test('an ordinary edit does not write an Aadhaar audit entry', async () => {
    const s = await Student.create({ tenantId: tenants.school._id, ...base('RV-6') });
    auditLog.mockClear();
    await call('patch', `/academic/students/${s._id}`, 'admin', { firstName: 'Anya' });
    expect(auditLog).not.toHaveBeenCalled();
  });
});
