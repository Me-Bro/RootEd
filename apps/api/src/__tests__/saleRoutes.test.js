// Plans, day passes and the desk sale (POST /fee/sales), the discount policy, and
// entitlement, driven through a mini Express app against an in-memory Mongo. Redis,
// BullMQ and object storage are faked; PDF generation is real, only the upload is not.
import { jest } from '@jest/globals';

const auditLog = jest.fn().mockResolvedValue(undefined);
jest.unstable_mockModule('../services/audit.service.js', () => ({
  auditLog,
  processAuditLog: jest.fn(),
}));
jest.unstable_mockModule('../config/redis.js', () => ({
  redis: {
    get: jest.fn(async () => null),
    setex: jest.fn(async () => 'OK'),
    del: jest.fn(async () => 1),
    scan: jest.fn(async () => ['0', []]),
    disconnect: jest.fn(),
  },
  connectRedis: jest.fn(async () => {}),
}));
const lateCharges = jest.fn();
jest.unstable_mockModule('bullmq', () => ({
  Queue: class {
    add(...args) {
      lateCharges(...args);
    }
    on() {}
    close() {}
  },
  Worker: class {},
}));
const uploadBuffer = jest.fn(async () => undefined);
jest.unstable_mockModule('../services/storage.service.js', () => ({
  uploadBuffer,
  getSignedUrl: jest.fn(async (key) => `https://files.test/${key}`),
}));

const { MongoMemoryServer } = await import('mongodb-memory-server');
const { default: mongoose } = await import('mongoose');
const { default: express } = await import('express');
const { default: request } = await import('supertest');
const { Tenant } = await import('../models/Tenant.js');
const { Role, DEFAULT_ROLE_TEMPLATES } = await import('../models/Role.js');
const { User } = await import('../models/User.js');
const { Student } = await import('../models/Student.js');
const { AcademicYear } = await import('../models/AcademicYear.js');
const { FeeStructure } = await import('../models/FeeStructure.js');
const { FeeAssignment } = await import('../models/FeeAssignment.js');
const { FeePayment } = await import('../models/FeePayment.js');
const { FeeDiscount } = await import('../models/FeeDiscount.js');
const { TenantMembership } = await import('../models/TenantMembership.js');
const { default: feeRouter } = await import('../routes/fee.js');
const { signAccessToken, hashPassword } = await import('../services/auth.service.js');
const { errorHandler } = await import('../middleware/errorHandler.js');

let mongod;
let app;
const tenants = {};
const tokens = {};
const ctx = {};
let n = 0;

async function makeTenant(subdomain, orgType) {
  const tenant = await Tenant.create({ name: `${subdomain} Centre`, subdomain, orgType });
  const roles = {};
  for (const [key, permissions] of Object.entries(DEFAULT_ROLE_TEMPLATES)) {
    roles[key] = await Role.create({
      tenantId: tenant._id,
      name: key,
      templateKey: key,
      permissions,
    });
  }
  const year = await AcademicYear.create({
    tenantId: tenant._id,
    name: 'Ongoing',
    startDate: new Date('2026-01-01'),
    endDate: new Date('2036-01-01'),
    isActive: true,
  });
  return { tenant, roles, year };
}

async function makeMember(tenant, role, label) {
  n += 1;
  const user = await User.create({
    email: `${label}${n}@sale.test`,
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
  return signAccessToken({ sub: user._id.toString() });
}

const mkStudent = (tenant, admissionNo, firstName, extra = {}) =>
  Student.create({ tenantId: tenant._id, admissionNo, firstName, lastName: 'Study', ...extra });

const setPolicy = (policy) =>
  Tenant.updateOne(
    { _id: tenants.study._id },
    { $set: { 'settings.centre.discountPolicy': policy } }
  );

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  await Promise.all([Student.syncIndexes(), FeeAssignment.syncIndexes(), FeePayment.syncIndexes()]);

  const study = await makeTenant('sale-study', 'study_center');
  const study2 = await makeTenant('sale-study2', 'study_center');
  const school = await makeTenant('sale-school', 'school');
  tenants.study = study.tenant;
  tenants.study2 = study2.tenant;
  tenants.school = school.tenant;
  ctx.year = study.year;
  ctx.year2 = study2.year;
  ctx.schoolYear = school.year;

  tokens.owner = await makeMember(study.tenant, study.roles.tenant_admin, 'owner');
  tokens.desk = await makeMember(study.tenant, study.roles.front_desk, 'desk');
  tokens.accountant = await makeMember(study.tenant, study.roles.accountant, 'acct');
  tokens.teacher = await makeMember(study.tenant, study.roles.teacher, 'teacher');
  tokens.owner2 = await makeMember(study2.tenant, study2.roles.tenant_admin, 'owner2');
  tokens.schoolAdmin = await makeMember(school.tenant, school.roles.tenant_admin, 'sadmin');
  tokens.schoolAcct = await makeMember(school.tenant, school.roles.accountant, 'sacct');

  ctx.m1 = await mkStudent(study.tenant, 'S-1', 'Asha');
  ctx.m2 = await mkStudent(study.tenant, 'S-2', 'Ravi');
  ctx.walkIn = await mkStudent(study.tenant, 'W-1', 'Visitor', {
    kind: 'walk_in',
    phone: '9876543210',
  });
  ctx.other = await mkStudent(study2.tenant, 'O-1', 'Outsider');

  app = express();
  app.use(express.json());
  app.use(async (req, _res, next) => {
    req.tenant = await Tenant.findById(tenants[req.headers['x-tenant'] ?? 'study']._id).lean();
    next();
  });
  app.use('/fee', feeRouter);
  app.use(errorHandler);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

const call = (method, path, who, body, tenant = 'study') => {
  const req = request(app)[method](path).set('x-tenant', tenant);
  if (who) req.set('Authorization', `Bearer ${tokens[who]}`);
  return body === undefined ? req : req.send(body);
};

const structureBody = (name, price, plan, extra = {}) => ({
  name,
  academicYearId: String(ctx.year._id),
  components: [{ label: name, amount: price }],
  ...(plan ? { plan } : {}),
  ...extra,
});

describe('plan structures', () => {
  test('the owner creates a day pass and a monthly plan; neither is auto-assigned to anyone', async () => {
    const day = await call(
      'post',
      '/fee/structures',
      'owner',
      structureBody('Day pass', 150, { kind: 'day_pass', durationDays: 1 })
    );
    expect(day.status).toBe(201);
    expect(day.body.plan).toMatchObject({ kind: 'day_pass', durationDays: 1 });
    // Whatever the form says, a plan is per-learner, so nothing is assigned to the roster.
    expect(day.body.applicableTo).toBe('student');
    expect(day.body.autoAssign).toEqual({ created: 0, skipped: 0 });

    const month = await call(
      'post',
      '/fee/structures',
      'owner',
      structureBody(
        'Monthly',
        1200,
        { kind: 'shift_plan', durationDays: 30 },
        { applicableTo: 'all' }
      )
    );
    expect(month.status).toBe(201);
    expect(month.body.applicableTo).toBe('student');
    expect(await FeeAssignment.countDocuments({ tenantId: tenants.study._id })).toBe(0);

    ctx.dayPass = day.body;
    ctx.monthly = month.body;
  });

  test('a regular fee structure still auto-assigns as before', async () => {
    const res = await call('post', '/fee/structures', 'owner', structureBody('Library fee', 50));
    expect(res.status).toBe(201);
    expect(res.body.plan).toBeUndefined();
    // Two members, the walk-in is skipped.
    expect(res.body.autoAssign.created).toBe(2);
    await FeeAssignment.deleteMany({ tenantId: tenants.study._id });
    ctx.regular = res.body;
  });

  test('a plan with installments, or a day pass longer than a day, is refused', async () => {
    const withInstallments = await call(
      'post',
      '/fee/structures',
      'owner',
      structureBody(
        'Bad A',
        100,
        { kind: 'shift_plan', durationDays: 30 },
        {
          installments: [{ label: 'one', amount: 100, dueDate: '2026-06-01' }],
        }
      )
    );
    expect(withInstallments.status).toBe(400);
    const longDay = await call(
      'post',
      '/fee/structures',
      'owner',
      structureBody('Bad B', 100, { kind: 'day_pass', durationDays: 2 })
    );
    expect(longDay.status).toBe(400);
  });

  test('a school cannot create a plan', async () => {
    const res = await call(
      'post',
      '/fee/structures',
      'schoolAdmin',
      {
        ...structureBody('Plan', 100, { kind: 'day_pass', durationDays: 1 }),
        academicYearId: String(ctx.schoolYear._id),
      },
      'school'
    );
    expect(res.status).toBe(400);
  });

  test('the front desk cannot create or edit a plan (no fees:write)', async () => {
    const create = await call(
      'post',
      '/fee/structures',
      'desk',
      structureBody('Desk plan', 100, { kind: 'day_pass', durationDays: 1 })
    );
    expect(create.status).toBe(403);
    const patch = await call('patch', `/fee/structures/${ctx.monthly._id}`, 'desk', { name: 'x' });
    expect(patch.status).toBe(403);
  });

  test('editing a plan keeps it per-learner and installment-free', async () => {
    const ok = await call('patch', `/fee/structures/${ctx.monthly._id}`, 'owner', {
      plan: { kind: 'shift_plan', durationDays: 28 },
    });
    expect(ok.status).toBe(200);
    expect(ok.body.plan.durationDays).toBe(28);
    expect(ok.body.applicableTo).toBe('student');

    const bad = await call('patch', `/fee/structures/${ctx.monthly._id}`, 'owner', {
      plan: { kind: 'shift_plan', durationDays: 30 },
      installments: [{ label: 'a', amount: 1200, dueDate: '2026-06-01' }],
    });
    expect(bad.status).toBe(400);
    await call('patch', `/fee/structures/${ctx.monthly._id}`, 'owner', {
      plan: { kind: 'shift_plan', durationDays: 30 },
    });
  });
});

describe('discount catalog', () => {
  const body = (over) => ({
    name: 'Student 10%',
    type: 'percentage',
    value: 10,
    applicableTo: 'student',
    studentId: String(ctx.m1?._id),
    academicYearId: String(ctx.year?._id),
    validTo: '2099-12-31',
    ...over,
  });

  test('a discount for one learner needs an end date, and the end cannot precede the start', async () => {
    const noEnd = await call('post', '/fee/discounts', 'owner', body({ validTo: undefined }));
    expect(noEnd.status).toBe(400);
    const backwards = await call(
      'post',
      '/fee/discounts',
      'owner',
      body({ validFrom: '2026-06-01', validTo: '2026-05-01' })
    );
    expect(backwards.status).toBe(400);
  });

  test('an all-learners discount may have no end date; only the owner creates any', async () => {
    const open = await call(
      'post',
      '/fee/discounts',
      'owner',
      body({
        name: 'Open 5%',
        value: 5,
        applicableTo: 'all',
        studentId: undefined,
        validTo: undefined,
      })
    );
    expect(open.status).toBe(201);
    ctx.openDiscount = open.body;
    expect((await call('post', '/fee/discounts', 'desk', body())).status).toBe(403);
    expect((await call('post', '/fee/discounts', 'accountant', body())).status).toBe(403);
  });

  test('the list filters by learner and can carry the learner’s name', async () => {
    const made = await call('post', '/fee/discounts', 'owner', body({ name: 'Asha standing' }));
    expect(made.status).toBe(201);
    ctx.standing = made.body;
    const list = await call(
      'get',
      `/fee/discounts?studentId=${ctx.m1._id}&withStudent=true`,
      'desk'
    );
    expect(list.body.map((d) => [d.name, d.studentName])).toEqual([
      ['Asha standing', 'Asha Study'],
    ]);
  });
});

describe('POST /fee/sales', () => {
  const sell = (who, studentId, structure, extra = {}, tenant = 'study') =>
    call(
      'post',
      '/fee/sales',
      who,
      {
        studentId: String(studentId),
        feeStructureId: String(structure._id),
        paymentMethod: 'cash',
        ...extra,
      },
      tenant
    );

  test('the desk sells a day pass to a walk-in: assignment, payment and a receipt in one request', async () => {
    const res = await sell('desk', ctx.walkIn._id, ctx.dayPass);
    expect(res.status).toBe(201);
    expect(res.body.assignment).toMatchObject({
      status: 'paid',
      totalAmount: 150,
      discountAmount: 0,
    });
    expect(res.body.payment).toMatchObject({ amount: 150, paymentMethod: 'cash' });
    expect(res.body.receiptUrl).toMatch(/^https:\/\/files\.test\/fees\//);
    expect(uploadBuffer).toHaveBeenCalled();

    // Covers today, in the centre's timezone: from local midnight to the last millisecond.
    const from = new Date(res.body.assignment.coversFrom);
    const to = new Date(res.body.assignment.coversTo);
    expect(to - from).toBe(24 * 60 * 60 * 1000 - 1);
    expect(auditLog).toHaveBeenCalledWith(expect.objectContaining({ action: 'feeSale.create' }));
    // A plan sale schedules no late charge.
    expect(lateCharges).not.toHaveBeenCalled();
  });

  test('a second day pass for the same learner is a new sale, not skipped', async () => {
    const before = await FeeAssignment.countDocuments({
      tenantId: tenants.study._id,
      studentId: ctx.walkIn._id,
    });
    const res = await sell('desk', ctx.walkIn._id, ctx.dayPass);
    expect(res.status).toBe(201);
    expect(
      await FeeAssignment.countDocuments({ tenantId: tenants.study._id, studentId: ctx.walkIn._id })
    ).toBe(before + 1);
  });

  test('a monthly plan covers its duration from the chosen start date', async () => {
    const res = await sell('desk', ctx.m2._id, ctx.monthly, { startDate: '2026-05-11T05:00:00Z' });
    expect(res.status).toBe(201);
    expect(res.body.assignment.coversFrom).toBe('2026-05-10T18:30:00.000Z');
    expect(res.body.assignment.coversTo).toBe('2026-06-09T18:29:59.999Z');
    expect(res.body.receiptUrl).toBeTruthy();
  });

  test('entitlement: valid after a sale, none before any (AC7 inputs)', async () => {
    const valid = await call('get', `/fee/entitlement?studentId=${ctx.walkIn._id}`, 'desk');
    expect(valid.status).toBe(200);
    expect(valid.body.status).toBe('valid');
    expect(valid.body.coversTo).toBeTruthy();

    const fresh = await mkStudent(tenants.study, 'S-NEW', 'Newbie');
    expect((await call('get', `/fee/entitlement?studentId=${fresh._id}`, 'desk')).body).toEqual({
      status: 'none',
      coversTo: null,
    });
  });

  test('entitlement is expired once the period has passed', async () => {
    const res = await sell('desk', ctx.m2._id, ctx.monthly, { startDate: '2020-01-01T05:00:00Z' });
    expect(res.status).toBe(201);
    // m2 also holds the May 2026 plan; ask about a learner with only the old one.
    const old = await mkStudent(tenants.study, 'S-OLD', 'Old');
    await sell('desk', old._id, ctx.monthly, { startDate: '2020-01-01T05:00:00Z' });
    expect((await call('get', `/fee/entitlement?studentId=${old._id}`, 'desk')).body.status).toBe(
      'expired'
    );
  });

  test('a standing discount applies automatically, even under owner-only policy (R21)', async () => {
    const res = await sell('desk', ctx.m1._id, ctx.monthly);
    expect(res.status).toBe(201);
    expect(res.body.discountAmount).toBe(120);
    expect(res.body.assignment).toMatchObject({ discountReason: 'Asha standing', status: 'paid' });
    expect(res.body.payment.amount).toBe(1080);
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'feeSale.discount',
        after: expect.objectContaining({ standing: true, amount: 120 }),
      })
    );
  });

  test('a standing discount past its end date is not applied (AC6)', async () => {
    await FeeDiscount.updateOne(
      { _id: ctx.standing._id, tenantId: tenants.study._id },
      { $set: { validTo: new Date('2020-01-01') } }
    );
    const res = await sell('desk', ctx.m1._id, ctx.monthly);
    expect(res.body.discountAmount).toBe(0);
    expect(res.body.payment.amount).toBe(1200);
    await FeeDiscount.updateOne(
      { _id: ctx.standing._id, tenantId: tenants.study._id },
      { $set: { validTo: new Date('2099-12-31') } }
    );
  });

  test('under owner policy the desk cannot apply a catalog discount, and nothing is created (AC5)', async () => {
    await setPolicy('owner');
    const before = await FeeAssignment.countDocuments({ tenantId: tenants.study._id });
    const res = await sell('desk', ctx.m2._id, ctx.dayPass, {
      discountId: String(ctx.openDiscount._id),
    });
    expect(res.status).toBe(403);
    expect(await FeeAssignment.countDocuments({ tenantId: tenants.study._id })).toBe(before);
    // An accountant holds fees:write, which owner policy still refuses.
    expect(
      (
        await sell('accountant', ctx.m2._id, ctx.dayPass, {
          discountId: String(ctx.openDiscount._id),
        })
      ).status
    ).toBe(403);
  });

  test('the owner may apply a catalog discount under every policy', async () => {
    for (const policy of ['owner', 'desk', 'staff']) {
      await setPolicy(policy);
      const res = await sell('owner', ctx.walkIn._id, ctx.dayPass, {
        discountId: String(ctx.openDiscount._id),
      });
      expect(res.status).toBe(201);
      expect(res.body.discountAmount).toBe(8); // 5% of 150, rounded
    }
  });

  test('under desk policy the desk may, and an unrelated role with no fees:collect may not', async () => {
    await setPolicy('desk');
    const ok = await sell('desk', ctx.m2._id, ctx.dayPass, {
      discountId: String(ctx.openDiscount._id),
    });
    expect(ok.status).toBe(201);
    expect(ok.body.payment.amount).toBe(142);
    expect((await sell('teacher', ctx.m2._id, ctx.dayPass)).status).toBe(403);
  });

  test('under staff policy fees:write may, fees:collect alone may not', async () => {
    await setPolicy('staff');
    expect(
      (await sell('desk', ctx.m2._id, ctx.dayPass, { discountId: String(ctx.openDiscount._id) }))
        .status
    ).toBe(403);
    expect(
      (
        await sell('accountant', ctx.m2._id, ctx.dayPass, {
          discountId: String(ctx.openDiscount._id),
        })
      ).status
    ).toBe(201);
    await setPolicy('owner');
  });

  test('a catalog discount outside its window, or for another learner, is refused', async () => {
    const expired = await FeeDiscount.create({
      tenantId: tenants.study._id,
      name: 'Old promo',
      type: 'percentage',
      value: 50,
      applicableTo: 'all',
      academicYearId: ctx.year._id,
      validTo: new Date('2020-01-01'),
    });
    const res = await sell('owner', ctx.m2._id, ctx.dayPass, { discountId: String(expired._id) });
    expect(res.status).toBe(422);

    const forAsha = ctx.standing;
    const wrong = await sell('owner', ctx.m2._id, ctx.dayPass, { discountId: String(forAsha._id) });
    expect(wrong.status).toBe(422);
  });

  test('a 100% discount is stored waived, records no payment, and still counts as a valid plan', async () => {
    const free = await FeeDiscount.create({
      tenantId: tenants.study._id,
      name: 'Scholarship',
      type: 'percentage',
      value: 100,
      applicableTo: 'all',
      academicYearId: ctx.year._id,
    });
    const learner = await mkStudent(tenants.study, 'S-FREE', 'Free');
    const before = await FeePayment.countDocuments({ tenantId: tenants.study._id });
    const res = await sell('owner', learner._id, ctx.monthly, { discountId: String(free._id) });
    expect(res.status).toBe(201);
    expect(res.body.payment).toBeNull();
    expect(res.body.assignment).toMatchObject({ status: 'waived', waivedReason: 'full discount' });
    expect(await FeePayment.countDocuments({ tenantId: tenants.study._id })).toBe(before);
    expect(
      (await call('get', `/fee/entitlement?studentId=${learner._id}`, 'desk')).body.status
    ).toBe('valid');
  });

  test('if the payment cannot be recorded, the new assignment is removed (EH3)', async () => {
    const learner = await mkStudent(tenants.study, 'S-FAIL', 'Fail');
    const spy = jest.spyOn(FeePayment, 'create').mockRejectedValueOnce(new Error('database down'));
    const res = await sell('desk', learner._id, ctx.dayPass);
    spy.mockRestore();
    expect(res.status).toBe(500);
    expect(
      await FeeAssignment.countDocuments({ tenantId: tenants.study._id, studentId: learner._id })
    ).toBe(0);
  });

  test('a receipt that cannot be stored does not undo a payment that was taken', async () => {
    const learner = await mkStudent(tenants.study, 'S-NOPDF', 'NoPdf');
    uploadBuffer.mockRejectedValueOnce(new Error('storage down'));
    const res = await sell('desk', learner._id, ctx.dayPass);
    expect(res.status).toBe(201);
    expect(res.body.receiptUrl).toBeNull();
    expect(res.body.payment.amount).toBe(150);
    expect(
      await FeePayment.countDocuments({ tenantId: tenants.study._id, studentId: learner._id })
    ).toBe(1);
    expect(
      await FeeAssignment.countDocuments({
        tenantId: tenants.study._id,
        studentId: learner._id,
        status: 'paid',
      })
    ).toBe(1);
  });

  test('refuses a fee that is not a plan, an inactive plan, and unknown things', async () => {
    expect((await sell('desk', ctx.m2._id, ctx.regular)).status).toBe(422);

    const off = await call(
      'post',
      '/fee/structures',
      'owner',
      structureBody('Off plan', 99, { kind: 'day_pass', durationDays: 1 })
    );
    await call('patch', `/fee/structures/${off.body._id}/deactivate`, 'owner');
    expect((await sell('desk', ctx.m2._id, off.body)).status).toBe(422);

    expect((await sell('desk', new mongoose.Types.ObjectId(), ctx.dayPass)).status).toBe(404);
    expect((await sell('desk', ctx.m2._id, { _id: new mongoose.Types.ObjectId() })).status).toBe(
      404
    );
    expect(
      (
        await call('post', '/fee/sales', 'desk', {
          studentId: 'x',
          feeStructureId: 'y',
          paymentMethod: 'cash',
        })
      ).status
    ).toBe(400);
    expect(
      (
        await call('post', '/fee/sales', 'desk', {
          studentId: String(ctx.m2._id),
          feeStructureId: String(ctx.dayPass._id),
          paymentMethod: 'barter',
        })
      ).status
    ).toBe(400);
  });

  test('needs fees:collect', async () => {
    expect((await sell('teacher', ctx.m2._id, ctx.dayPass)).status).toBe(403);
  });

  test('is tenant-scoped: another centre’s learner or plan is a 404', async () => {
    expect((await sell('desk', ctx.other._id, ctx.dayPass)).status).toBe(404);
    const res = await call(
      'post',
      '/fee/sales',
      'owner2',
      {
        studentId: String(ctx.other._id),
        feeStructureId: String(ctx.dayPass._id),
        paymentMethod: 'cash',
      },
      'study2'
    );
    expect(res.status).toBe(404);
  });

  test('is not available to a school', async () => {
    const res = await call(
      'post',
      '/fee/sales',
      'schoolAdmin',
      {
        studentId: String(ctx.m1._id),
        feeStructureId: String(ctx.dayPass._id),
        paymentMethod: 'cash',
      },
      'school'
    );
    expect(res.status).toBe(403);
    expect(
      (
        await call(
          'get',
          `/fee/entitlement?studentId=${ctx.m1._id}`,
          'schoolAdmin',
          undefined,
          'school'
        )
      ).status
    ).toBe(403);
  });

  test('entitlement for another centre’s learner is a 404', async () => {
    expect((await call('get', `/fee/entitlement?studentId=${ctx.other._id}`, 'desk')).status).toBe(
      404
    );
  });
});

describe('the existing discount route follows the tenant’s policy', () => {
  const regularAssignment = async (tenant, student, year, structureId) =>
    FeeAssignment.create({
      tenantId: tenant._id,
      studentId: student._id,
      feeStructureId: structureId,
      academicYearId: year._id,
      totalAmount: 1000,
    });

  test('a study center: owner-only by default, then desk, then staff', async () => {
    const discount = ctx.openDiscount;
    const apply = async (who) => {
      const a = await regularAssignment(tenants.study, ctx.m2, ctx.year, ctx.regular._id);
      return call('post', `/fee/assignments/${a._id}/discount`, who, {
        discountId: String(discount._id),
      });
    };

    await setPolicy('owner');
    expect((await apply('desk')).status).toBe(403);
    expect((await apply('accountant')).status).toBe(403);
    expect((await apply('owner')).status).toBe(200);

    await setPolicy('desk');
    expect((await apply('desk')).status).toBe(200);

    await setPolicy('staff');
    expect((await apply('accountant')).status).toBe(200);
    expect((await apply('desk')).status).toBe(403);
    await setPolicy('owner');
  });

  test('a school keeps today’s rule: fees:write may, nobody else', async () => {
    const structure = await FeeStructure.create({
      tenantId: tenants.school._id,
      name: 'Tuition',
      academicYearId: ctx.schoolYear._id,
      components: [{ label: 'Tuition', amount: 1000 }],
    });
    const student = await mkStudent(tenants.school, 'SCH-1', 'Pupil');
    const discount = await FeeDiscount.create({
      tenantId: tenants.school._id,
      name: 'Sibling',
      type: 'flat',
      value: 100,
      applicableTo: 'all',
      academicYearId: ctx.schoolYear._id,
    });
    const a = await regularAssignment(tenants.school, student, ctx.schoolYear, structure._id);

    const accountant = await call(
      'post',
      `/fee/assignments/${a._id}/discount`,
      'schoolAcct',
      { discountId: String(discount._id) },
      'school'
    );
    expect(accountant.status).toBe(200);
    expect(accountant.body.discountAmount).toBe(100);
  });
});
