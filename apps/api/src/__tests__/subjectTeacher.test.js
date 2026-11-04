import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { Tenant } from '../models/Tenant.js';
import { Role } from '../models/Role.js';
import { User } from '../models/User.js';
import { TenantMembership } from '../models/TenantMembership.js';
import { StaffMember } from '../models/StaffMember.js';
import { SubjectTeacher } from '../models/SubjectTeacher.js';
import { assertTeacher } from '../services/subjectTeacher.service.js';
import { subjectTeacherQuerySchema } from '@rooted/shared/schemas';

let mongod;
let tenant;
let other;
let teacherRole;
let studentRole;
let n = 0;

async function member(t, roles, status = 'active') {
  n += 1;
  const user = await User.create({
    email: `u${n}@x.test`,
    username: `u${n}`,
    passwordHash: 'x',
    firstName: 'U',
    lastName: String(n),
  });
  await TenantMembership.create({
    tenantId: t._id,
    userId: user._id,
    roleIds: roles.map((r) => r._id),
    status,
  });
  return user;
}

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  await SubjectTeacher.syncIndexes();
  tenant = await Tenant.create({ name: 'A College', subdomain: 'a-college' });
  other = await Tenant.create({ name: 'B College', subdomain: 'b-college' });
  teacherRole = await Role.create({
    tenantId: tenant._id,
    name: 'teacher',
    templateKey: 'teacher',
    permissions: ['training:read'],
  });
  studentRole = await Role.create({
    tenantId: tenant._id,
    name: 'student',
    templateKey: 'student',
    permissions: [],
  });
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

test('an active staff member is accepted as a teacher', async () => {
  const user = await member(tenant, [teacherRole]);
  await expect(assertTeacher(tenant._id, user._id)).resolves.toBeUndefined();
});

test('a student is rejected', async () => {
  const user = await member(tenant, [studentRole]);
  await expect(assertTeacher(tenant._id, user._id)).rejects.toMatchObject({ status: 404 });
});

test('a member of another college is rejected', async () => {
  const user = await member(tenant, [teacherRole]);
  await expect(assertTeacher(other._id, user._id)).rejects.toMatchObject({ status: 404 });
});

test('an invited or removed member is rejected', async () => {
  const user = await member(tenant, [teacherRole], 'invited');
  await expect(assertTeacher(tenant._id, user._id)).rejects.toMatchObject({ status: 404 });
});

// A staff member added without a login has an account (the role-less invited stub) but no
// active membership. They can still be put on a subject; they see it once they get a login.
async function staffWithoutLogin(t, employmentStatus = 'active') {
  const user = await member(t, [], 'invited');
  await StaffMember.create({
    tenantId: t._id,
    userId: user._id,
    firstName: 'No',
    lastName: 'Login',
    employmentStatus,
  });
  return user;
}

test('a staff member with no login yet is accepted as a teacher', async () => {
  const user = await staffWithoutLogin(tenant);
  await expect(assertTeacher(tenant._id, user._id)).resolves.toBeUndefined();
});

test('a staff member who has left is rejected', async () => {
  const user = await staffWithoutLogin(tenant, 'resigned');
  await expect(assertTeacher(tenant._id, user._id)).rejects.toMatchObject({ status: 404 });
});

test('a staff member of another college is rejected', async () => {
  const user = await staffWithoutLogin(tenant);
  await expect(assertTeacher(other._id, user._id)).rejects.toMatchObject({ status: 404 });
});

test('an account that is not on the staff list is still rejected without a role', async () => {
  const user = await member(tenant, [], 'invited');
  await expect(assertTeacher(tenant._id, user._id)).rejects.toMatchObject({ status: 404 });
});

test('one teacher per module, batch and run', async () => {
  const id = () => new mongoose.Types.ObjectId();
  const row = { tenantId: tenant._id, subjectId: id(), sectionId: id(), termId: id() };
  await SubjectTeacher.create({ ...row, teacherId: id() });
  await expect(SubjectTeacher.create({ ...row, teacherId: id() })).rejects.toMatchObject({
    code: 11000,
  });
  // the same module in another batch is a different row
  await expect(
    SubjectTeacher.create({ ...row, sectionId: id(), teacherId: id() })
  ).resolves.toBeDefined();
});

test('the assignment list can be filtered by subject, and still by section and term alone', () => {
  const id = new mongoose.Types.ObjectId().toString();
  expect(subjectTeacherQuerySchema.parse({ subjectId: id })).toEqual({ subjectId: id });
  expect(subjectTeacherQuerySchema.parse({ sectionId: id, termId: id })).toEqual({
    sectionId: id,
    termId: id,
  });
  expect(() => subjectTeacherQuerySchema.parse({ subjectId: 'nope' })).toThrow();
});
