import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { Tenant } from '../models/Tenant.js';
import { Role, DEFAULT_ROLE_TEMPLATES } from '../models/Role.js';
import { AcademicYear } from '../models/AcademicYear.js';
import { up as addFrontDesk } from '../migrations/0005-study-center-front-desk-role.js';
import { up as addOngoingYear } from '../migrations/0006-study-center-ongoing-year.js';
import { up as addSelfSeatRead } from '../migrations/0007-add-self-seat-read.js';

let mongod;
const BYPASS = { _bypassTenantScope: true };

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

afterEach(async () => {
  await Promise.all([
    Tenant.deleteMany({}),
    Role.deleteMany({}, BYPASS),
    AcademicYear.deleteMany({}, BYPASS),
  ]);
});

const tenantOf = (orgType, subdomain) => Tenant.create({ name: subdomain, subdomain, orgType });

describe('0005 front_desk role', () => {
  test('adds the template to a study center that lacks it, and only to study centers', async () => {
    const study = await tenantOf('study_center', 'sc-a');
    const school = await tenantOf('school', 'sch-a');
    const tuition = await tenantOf('tuition_center', 'tui-a');

    await addFrontDesk();

    const role = await Role.findOne(
      { tenantId: study._id, templateKey: 'front_desk' },
      null,
      BYPASS
    ).lean();
    expect(role.isTemplate).toBe(true);
    expect(role.permissions).toEqual(DEFAULT_ROLE_TEMPLATES.front_desk);
    for (const other of [school, tuition]) {
      expect(await Role.countDocuments({ tenantId: other._id }, BYPASS)).toBe(0);
    }
  });

  test('is idempotent and leaves an existing role untouched', async () => {
    const study = await tenantOf('study_center', 'sc-b');
    await Role.create({
      tenantId: study._id,
      name: 'front desk',
      templateKey: 'front_desk',
      isTemplate: true,
      permissions: ['students:read'],
    });

    await addFrontDesk();
    await addFrontDesk();

    const roles = await Role.find(
      { tenantId: study._id, templateKey: 'front_desk' },
      null,
      BYPASS
    ).lean();
    expect(roles).toHaveLength(1);
    expect(roles[0].permissions).toEqual(['students:read']);
  });
});

describe('0006 Ongoing academic year', () => {
  test('creates one active year for a study center with none, and none for other org types', async () => {
    const study = await tenantOf('study_center', 'sc-c');
    const school = await tenantOf('school', 'sch-c');

    await addOngoingYear();

    const years = await AcademicYear.find({ tenantId: study._id }, null, BYPASS).lean();
    expect(years).toHaveLength(1);
    expect(years[0]).toMatchObject({ name: 'Ongoing', isActive: true });
    expect(years[0].endDate.getTime()).toBeGreaterThan(years[0].startDate.getTime());
    expect(await AcademicYear.countDocuments({ tenantId: school._id }, BYPASS)).toBe(0);
  });

  test('leaves a study center that already has a year alone, and is idempotent', async () => {
    const study = await tenantOf('study_center', 'sc-d');
    await AcademicYear.create({
      tenantId: study._id,
      name: '2026',
      startDate: new Date('2026-01-01'),
      endDate: new Date('2026-12-31'),
      isActive: true,
    });

    await addOngoingYear();
    await addOngoingYear();

    const years = await AcademicYear.find({ tenantId: study._id }, null, BYPASS).lean();
    expect(years.map((y) => y.name)).toEqual(['2026']);
  });
});

describe('0007 self:seat:read', () => {
  test('adds the permission to every student template of every tenant, and is idempotent', async () => {
    const [a, b] = await Promise.all([
      tenantOf('study_center', 'sc-e'),
      tenantOf('school', 'sch-e'),
    ]);
    for (const tenant of [a, b]) {
      await Role.create([
        {
          tenantId: tenant._id,
          name: 'student',
          templateKey: 'student',
          isTemplate: true,
          permissions: ['self:attendance:read'],
        },
        {
          tenantId: tenant._id,
          name: 'teacher',
          templateKey: 'teacher',
          isTemplate: true,
          permissions: ['attendance:write'],
        },
      ]);
    }

    await addSelfSeatRead();
    await addSelfSeatRead();

    for (const tenant of [a, b]) {
      const student = await Role.findOne(
        { tenantId: tenant._id, templateKey: 'student' },
        null,
        BYPASS
      ).lean();
      expect(student.permissions).toEqual(['self:attendance:read', 'self:seat:read']);
      const teacher = await Role.findOne(
        { tenantId: tenant._id, templateKey: 'teacher' },
        null,
        BYPASS
      ).lean();
      expect(teacher.permissions).toEqual(['attendance:write']);
    }
  });
});
