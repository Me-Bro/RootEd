import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { Tenant } from '../models/Tenant.js';
import { Role, DEFAULT_ROLE_TEMPLATES } from '../models/Role.js';
import { User } from '../models/User.js';
import { Student } from '../models/Student.js';
import { StaffMember } from '../models/StaffMember.js';
import { TenantMembership } from '../models/TenantMembership.js';
import { hashPassword } from '../services/auth.service.js';
import { resolveContext, invalidatePermissions } from '../middleware/requirePermission.js';
import { redis } from '../config/redis.js';

let mongod;
let tenant;
let studentRole;
let teacherRole;
let n = 0;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());

  tenant = await Tenant.create({ name: 'Scope School', subdomain: 'scope-school' });
  studentRole = await Role.create({
    tenantId: tenant._id,
    name: 'student',
    templateKey: 'student',
    permissions: DEFAULT_ROLE_TEMPLATES.student,
  });
  teacherRole = await Role.create({
    tenantId: tenant._id,
    name: 'teacher',
    templateKey: 'teacher',
    permissions: DEFAULT_ROLE_TEMPLATES.teacher,
  });
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
  redis.disconnect();
});

async function makeUser() {
  n += 1;
  return User.create({
    email: `scoped${n}@school.edu`,
    username: `scoped-${n}`,
    usernameLower: `scoped-${n}`,
    passwordHash: await hashPassword('irrelevant-but-valid'),
    emailVerified: true,
    status: 'active',
  });
}

async function member(user, roleIds, status = 'active') {
  return TenantMembership.create({ tenantId: tenant._id, userId: user._id, roleIds, status });
}

const ctx = (user) => resolveContext(user._id.toString(), tenant._id.toString());

test('a member with no linked records has no subjects', async () => {
  const user = await makeUser();
  await member(user, [teacherRole._id]);
  await invalidatePermissions(tenant._id, user._id);

  const { permissions, subjects } = await ctx(user);
  expect(permissions).toEqual(expect.arrayContaining(['attendance:read']));
  expect(subjects).toEqual({});
});

test('a linked student resolves to their student record and section', async () => {
  const user = await makeUser();
  const sectionId = new mongoose.Types.ObjectId();
  const student = await Student.create({
    tenantId: tenant._id,
    userId: user._id,
    admissionNo: `ADM-${n}`,
    firstName: 'Rita',
    lastName: 'Bose',
    sectionId,
  });
  await member(user, [studentRole._id]);
  await invalidatePermissions(tenant._id, user._id);

  const { permissions, subjects } = await ctx(user);
  expect(subjects.studentId).toBe(student._id.toString());
  expect(subjects.sectionId).toBe(sectionId.toString());
  // Holds nothing tenant-wide — that is what makes /me the only reachable
  // surface for this role.
  expect(permissions.every((p) => p.startsWith('self:'))).toBe(true);
});

test('a linked staff member resolves to their staff record', async () => {
  const user = await makeUser();
  const staff = await StaffMember.create({
    tenantId: tenant._id,
    userId: user._id,
    employeeId: `EMP-${n}`,
    firstName: 'Sam',
    lastName: 'Teacher',
  });
  await member(user, [teacherRole._id]);
  await invalidatePermissions(tenant._id, user._id);

  const { subjects } = await ctx(user);
  expect(subjects.staffId).toBe(staff._id.toString());
  expect(subjects.studentId).toBeUndefined();
});

test('one person can be both, in the same organization', async () => {
  const user = await makeUser();
  const student = await Student.create({
    tenantId: tenant._id,
    userId: user._id,
    admissionNo: `ADM-BOTH-${n}`,
    firstName: 'Both',
    lastName: 'Roles',
  });
  const staff = await StaffMember.create({
    tenantId: tenant._id,
    userId: user._id,
    employeeId: `EMP-BOTH-${n}`,
    firstName: 'Both',
    lastName: 'Roles',
  });
  await member(user, [teacherRole._id, studentRole._id]);
  await invalidatePermissions(tenant._id, user._id);

  const { subjects, permissions } = await ctx(user);
  expect(subjects.studentId).toBe(student._id.toString());
  expect(subjects.staffId).toBe(staff._id.toString());
  // Teaching goes through /academic, their own marks through /me. Separate
  // namespaces, no branching in either.
  expect(permissions).toEqual(expect.arrayContaining(['grades:write', 'self:grades:read']));
});

test('a suspended member resolves to nothing at all', async () => {
  const user = await makeUser();
  await Student.create({
    tenantId: tenant._id,
    userId: user._id,
    admissionNo: `ADM-SUS-${n}`,
    firstName: 'Sus',
    lastName: 'Pended',
  });
  await member(user, [studentRole._id], 'suspended');
  await invalidatePermissions(tenant._id, user._id);

  // No subjects either: a suspended student must not reach /me by virtue of
  // still having a Student row.
  expect(await ctx(user)).toEqual({ permissions: [], subjects: {} });
});

test('a student in another tenant is not resolved here', async () => {
  const other = await Tenant.create({ name: 'Elsewhere', subdomain: 'elsewhere-scope' });
  const user = await makeUser();
  await Student.create({
    tenantId: other._id,
    userId: user._id,
    admissionNo: 'ADM-OTHER',
    firstName: 'Else',
    lastName: 'Where',
  });
  await member(user, [studentRole._id]);
  await invalidatePermissions(tenant._id, user._id);

  const { subjects } = await ctx(user);
  expect(subjects.studentId).toBeUndefined();
});
