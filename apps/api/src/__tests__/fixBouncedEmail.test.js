import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { Tenant } from '../models/Tenant.js';
import { Role, DEFAULT_ROLE_TEMPLATES } from '../models/Role.js';
import { User } from '../models/User.js';
import { Student } from '../models/Student.js';
import { StaffMember } from '../models/StaffMember.js';
import { TenantMembership } from '../models/TenantMembership.js';
import { hashPassword, hashToken } from '../services/auth.service.js';
import { provisionStudentAccount, fixBouncedEmail } from '../services/identity.service.js';
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
  await User.syncIndexes();

  tenant = await Tenant.create({ name: 'Fix School', subdomain: 'fix-school' });
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

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
  redis.disconnect();
});

const enqueue = async (kind, args) => {
  queued.push({ kind, args });
};

// A roster student with a claimable login whose address has been flagged bounced.
async function bouncedStudent({ bounced = true } = {}) {
  n += 1;
  const student = await Student.create({
    tenantId: tenant._id,
    admissionNo: `FIX-${n}`,
    firstName: 'Rita',
    lastName: 'Bose',
  });
  const email = `typo${n}@gmial.test`;
  const { user } = await provisionStudentAccount({
    tenant,
    student,
    email,
    studentRoleId: studentRole._id,
    enqueue: async () => {},
  });
  if (bounced) {
    await User.updateOne(
      { _id: user._id },
      { $set: { emailBouncedAt: new Date(), emailBounceReason: 'HardBounce' } }
    );
  }
  const membership = await TenantMembership.findOne({
    tenantId: tenant._id,
    userId: user._id,
  }).lean();
  return { user, membership, email };
}

const fix = (membership, email, t = tenant) =>
  fixBouncedEmail({ tenant: t, membership, email, enqueue });

test('replaces the address, clears the flag and mails a fresh claim link to the new one', async () => {
  const { user, membership, email } = await bouncedStudent();
  const before = await User.findById(user._id).select('+passwordResetToken').lean();

  const res = await fix(membership, `rita${n}@school.edu`);
  expect(res.previousEmail).toBe(email);

  const after = await User.findById(user._id).select('+passwordResetToken').lean();
  expect(after.email).toBe(`rita${n}@school.edu`);
  expect(after.emailBouncedAt).toBeUndefined();
  expect(after.emailBounceReason).toBeUndefined();
  expect(after.status).toBe('pending_claim');
  expect(after.emailVerified).toBe(false);

  // The link that went to the dead address no longer works.
  expect(after.passwordResetToken).not.toBe(before.passwordResetToken);
  expect(queued).toHaveLength(1);
  const [to, orgName, url] = queued[0].args;
  expect(to).toBe(`rita${n}@school.edu`);
  expect(orgName).toBe('Fix School');
  expect(after.passwordResetToken).toBe(hashToken(url.split('token=')[1]));
});

test('refuses an address that has not bounced', async () => {
  const { membership } = await bouncedStudent({ bounced: false });
  await expect(fix(membership, `new${n}@school.edu`)).rejects.toMatchObject({ status: 409 });
  expect(queued).toHaveLength(0);
});

test('refuses someone who has already set a password', async () => {
  const { user, membership } = await bouncedStudent();
  await User.updateOne({ _id: user._id }, { $set: { status: 'active' } });
  await expect(fix(membership, `new${n}@school.edu`)).rejects.toMatchObject({ status: 409 });
  expect((await User.findById(user._id).lean()).email).toBe(`typo${n}@gmial.test`);
});

test('refuses the address that bounced', async () => {
  const { membership, email } = await bouncedStudent();
  await expect(fix(membership, email)).rejects.toMatchObject({ status: 400 });
});

test('refuses an address another account already holds, without taking it over', async () => {
  const { user, membership } = await bouncedStudent();
  const taken = `taken${n}@school.edu`;
  await User.create({
    email: taken,
    username: `taken-${n}`,
    usernameLower: `taken-${n}`,
    passwordHash: await hashPassword('x-password-1'),
    status: 'active',
  });
  await expect(fix(membership, taken)).rejects.toMatchObject({ status: 409 });
  expect((await User.findById(user._id).lean()).email).toBe(`typo${n}@gmial.test`);
  expect(queued).toHaveLength(0);
});

test('refuses a login that another organization also uses', async () => {
  const { user, membership } = await bouncedStudent();
  const other = await Tenant.create({ name: 'Other School', subdomain: `other-${n}` });
  await TenantMembership.create({
    tenantId: other._id,
    userId: user._id,
    roleIds: [],
    status: 'active',
  });
  await expect(fix(membership, `new${n}@school.edu`)).rejects.toMatchObject({ status: 409 });
  expect((await User.findById(user._id).lean()).email).toBe(`typo${n}@gmial.test`);
});
