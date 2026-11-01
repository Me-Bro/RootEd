import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { Tenant } from '../models/Tenant.js';
import { Role } from '../models/Role.js';
import { User } from '../models/User.js';
import { TenantMembership } from '../models/TenantMembership.js';
import { AcademicYear } from '../models/AcademicYear.js';
import { Term } from '../models/Term.js';
import { SubjectTeacher } from '../models/SubjectTeacher.js';
import { ensureAssignments } from '../services/subjectTeacher.service.js';

let mongod;
let tenant;
let other;
let teacherRole;
let studentRole;
let year;
let terms;
let n = 0;
const sectionId = new mongoose.Types.ObjectId();
const subjectId = new mongoose.Types.ObjectId();

async function member(t, role) {
  n += 1;
  const user = await User.create({
    email: `e${n}@x.test`,
    username: `e${n}`,
    passwordHash: 'x',
    firstName: 'E',
    lastName: String(n),
  });
  await TenantMembership.create({
    tenantId: t._id,
    userId: user._id,
    roleIds: [role._id],
    status: 'active',
  });
  return user;
}

const args = (teacherId, over = {}) => ({
  tenantId: tenant._id,
  academicYearId: year._id,
  sectionId,
  subjectId,
  teacherId,
  ...over,
});

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  await SubjectTeacher.syncIndexes();
  tenant = await Tenant.create({ name: 'A School', subdomain: 'a-school' });
  other = await Tenant.create({ name: 'B School', subdomain: 'b-school' });
  teacherRole = await Role.create({
    tenantId: tenant._id,
    name: 'teacher',
    templateKey: 'teacher',
    permissions: ['students:read'],
  });
  studentRole = await Role.create({
    tenantId: tenant._id,
    name: 'student',
    templateKey: 'student',
    permissions: [],
  });
  year = await AcademicYear.create({
    tenantId: tenant._id,
    name: '2026',
    startDate: new Date('2026-04-01'),
    endDate: new Date('2027-03-31'),
    isActive: true,
  });
  terms = await Term.create([
    {
      tenantId: tenant._id,
      academicYearId: year._id,
      name: 'T1',
      startDate: new Date('2026-04-01'),
      endDate: new Date('2026-09-30'),
    },
    {
      tenantId: tenant._id,
      academicYearId: year._id,
      name: 'T2',
      startDate: new Date('2026-10-01'),
      endDate: new Date('2027-03-31'),
    },
  ]);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

afterEach(async () => {
  await SubjectTeacher.deleteMany({}, { _bypassTenantScope: true });
});

test('creates one assignment for each term of the year', async () => {
  const teacher = await member(tenant, teacherRole);

  expect(await ensureAssignments(args(teacher._id))).toBe(2);

  const rows = await SubjectTeacher.find({ tenantId: tenant._id, subjectId, sectionId }).lean();
  expect(rows.map((r) => String(r.termId)).sort()).toEqual(terms.map((t) => String(t._id)).sort());
  expect(rows.every((r) => String(r.teacherId) === String(teacher._id))).toBe(true);
});

test('leaves an existing assignment alone and fills only the missing term', async () => {
  const alice = await member(tenant, teacherRole);
  const bob = await member(tenant, teacherRole);
  await SubjectTeacher.create({
    tenantId: tenant._id,
    subjectId,
    sectionId,
    termId: terms[0]._id,
    teacherId: alice._id,
  });

  expect(await ensureAssignments(args(bob._id))).toBe(1);

  const rows = await SubjectTeacher.find({ tenantId: tenant._id, subjectId, sectionId }).lean();
  const byTerm = Object.fromEntries(rows.map((r) => [String(r.termId), String(r.teacherId)]));
  expect(byTerm[String(terms[0]._id)]).toBe(String(alice._id));
  expect(byTerm[String(terms[1]._id)]).toBe(String(bob._id));
});

test('a second call creates nothing', async () => {
  const teacher = await member(tenant, teacherRole);
  await ensureAssignments(args(teacher._id));
  expect(await ensureAssignments(args(teacher._id))).toBe(0);
});

test('creates nothing for a student or for a user of another tenant', async () => {
  const student = await member(tenant, studentRole);
  const outsider = await User.create({
    email: 'out@x.test',
    username: 'out',
    passwordHash: 'x',
    firstName: 'O',
    lastName: 'O',
  });
  await TenantMembership.create({
    tenantId: other._id,
    userId: outsider._id,
    roleIds: [teacherRole._id],
    status: 'active',
  });

  expect(await ensureAssignments(args(student._id))).toBe(0);
  expect(await ensureAssignments(args(outsider._id))).toBe(0);
  expect(await SubjectTeacher.countDocuments({}, { _bypassTenantScope: true })).toBe(0);
});

test('a year with no terms creates nothing', async () => {
  const teacher = await member(tenant, teacherRole);
  const empty = await AcademicYear.create({
    tenantId: tenant._id,
    name: '2027',
    startDate: new Date('2027-04-01'),
    endDate: new Date('2028-03-31'),
  });
  expect(await ensureAssignments(args(teacher._id, { academicYearId: empty._id }))).toBe(0);
});
