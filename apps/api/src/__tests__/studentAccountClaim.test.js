import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { Tenant } from '../models/Tenant.js';
import { Role, DEFAULT_ROLE_TEMPLATES } from '../models/Role.js';
import { User } from '../models/User.js';
import { Student } from '../models/Student.js';
import { StaffMember } from '../models/StaffMember.js';
import { TenantMembership } from '../models/TenantMembership.js';
import { hashPassword, hashToken } from '../services/auth.service.js';
import { provisionStudentAccount } from '../services/identity.service.js';
import { redis } from '../config/redis.js';

let mongod;
let tenant;
let studentRole;
let queued;
let n = 0;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  await Student.syncIndexes();
  await StaffMember.syncIndexes();

  tenant = await Tenant.create({ name: 'Claim School', subdomain: 'claim-school' });
  studentRole = await Role.create({
    tenantId: tenant._id,
    name: 'student',
    templateKey: 'student',
    permissions: DEFAULT_ROLE_TEMPLATES.student,
  });
});

beforeEach(() => {
  queued = [];
});

const enqueue = async (kind, args) => {
  queued.push({ kind, args });
};

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
  redis.disconnect();
});

async function roster(firstName = 'Rita') {
  n += 1;
  return Student.create({
    tenantId: tenant._id,
    admissionNo: `ADM-${n}`,
    firstName,
    lastName: 'Bose',
  });
}

const provision = (student, email) =>
  provisionStudentAccount({ tenant, student, email, studentRoleId: studentRole._id, enqueue });

test('a roster student gets a claimable account, not a usable one', async () => {
  const student = await roster();
  const { user } = await provision(student, `claim${n}@school.edu`);

  const stored = await User.findById(user._id).select('+passwordHash +passwordResetToken').lean();
  expect(stored.status).toBe('pending_claim');
  expect(stored.emailVerified).toBe(false);
  // A password exists so the document is valid, but nobody was ever told it.
  expect(stored.passwordHash).toEqual(expect.any(String));
  expect(stored.passwordResetToken).toEqual(expect.any(String));

  const linked = await Student.findById(student._id).lean();
  expect(String(linked.userId)).toBe(String(user._id));

  const membership = await TenantMembership.findOne({
    tenantId: tenant._id,
    userId: user._id,
  }).lean();
  expect(membership.status).toBe('active');
  expect(membership.joinMethod).toBe('import');
  expect(membership.roleIds.map(String)).toEqual([String(studentRole._id)]);
});

test('the claim link is queued, never sent inline', async () => {
  const student = await roster();
  const email = `queued${n}@school.edu`;
  await provision(student, email);

  expect(queued).toHaveLength(1);
  expect(queued[0].kind).toBe('accountClaim');
  const [to, orgName, url] = queued[0].args;
  expect(to).toBe(email);
  expect(orgName).toBe('Claim School');

  // The raw token travels only in that URL; the database holds its digest.
  const token = url.split('token=')[1];
  const stored = await User.findOne({ email }).select('+passwordResetToken').lean();
  expect(stored.passwordResetToken).toBe(hashToken(token));
});

test('an existing account is linked but gets no claim link', async () => {
  const email = `existing${(n += 1)}@school.edu`;
  const existing = await User.create({
    email,
    username: `existing-${n}`,
    usernameLower: `existing-${n}`,
    passwordHash: await hashPassword('a-password-they-know'),
    status: 'active',
    emailVerified: true,
  });

  const student = await roster();
  const { user } = await provision(student, email);

  expect(String(user._id)).toBe(String(existing._id));
  // They already have working credentials; mailing a claim link would be an
  // unsolicited password-reset invitation.
  expect(queued).toHaveLength(0);
});

test('an import cannot revive a suspended membership', async () => {
  const email = `suspended${(n += 1)}@school.edu`;
  const existing = await User.create({
    email,
    username: `suspended-${n}`,
    usernameLower: `suspended-${n}`,
    passwordHash: await hashPassword('irrelevant-but-valid'),
    status: 'active',
  });
  await TenantMembership.create({
    tenantId: tenant._id,
    userId: existing._id,
    roleIds: [],
    status: 'suspended',
  });

  const student = await roster();
  const { user, reason } = await provision(student, email);

  expect(user).toBeNull();
  expect(reason).toMatch(/suspended/i);
  expect((await Student.findById(student._id).lean()).userId).toBeUndefined();
  const membership = await TenantMembership.findOne({
    tenantId: tenant._id,
    userId: existing._id,
  }).lean();
  expect(membership.status).toBe('suspended');
});

test('a roster of students with no email is untouched', async () => {
  // The normal case: pupils too young to have an address. They must import
  // without accounts and without colliding — see the partial index.
  const before = await Student.countDocuments({ tenantId: tenant._id });
  for (let i = 0; i < 4; i += 1) await roster('NoEmail');
  expect(await Student.countDocuments({ tenantId: tenant._id })).toBe(before + 4);
  expect(queued).toHaveLength(0);
});

test('two staff members without an employee ID can coexist', async () => {
  // Defect #16: the (tenantId, employeeId) index was compound-sparse, which
  // still indexes rows where employeeId is absent, so the second one collided.
  await expect(
    StaffMember.create({
      tenantId: tenant._id,
      userId: new mongoose.Types.ObjectId(),
      firstName: 'One',
    })
  ).resolves.toBeDefined();
  await expect(
    StaffMember.create({
      tenantId: tenant._id,
      userId: new mongoose.Types.ObjectId(),
      firstName: 'Two',
    })
  ).resolves.toBeDefined();
});
