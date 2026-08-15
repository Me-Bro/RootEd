/**
 * seed-test-data.js — seeds deterministic test data into eduflow_test DB.
 *
 * Usage:
 *   node --env-file=.env.test src/scripts/seed-test-data.js
 *   node --env-file=.env.test src/scripts/seed-test-data.js --clean
 *
 * --clean: drops all collections before seeding (full reset)
 *
 * Outputs seeded IDs to stdout as JSON so Playwright fixtures can parse them.
 */

import '../config/env.js';
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { User } from '../models/User.js';
import { Tenant } from '../models/Tenant.js';
import { Role, DEFAULT_ROLE_TEMPLATES } from '../models/Role.js';
import { TenantMembership } from '../models/TenantMembership.js';
import { AcademicYear } from '../models/AcademicYear.js';
import { Term } from '../models/Term.js';
import { Class } from '../models/Class.js';
import { Section } from '../models/Section.js';
import { Subject } from '../models/Subject.js';
import { Student } from '../models/Student.js';
import { StaffMember } from '../models/StaffMember.js';
import { LeaveType } from '../models/LeaveType.js';
import { SalaryStructure } from '../models/SalaryStructure.js';
import { CostCenter } from '../models/CostCenter.js';
import { FeeStructure } from '../models/FeeStructure.js';
import { Consumable, FixedAsset } from '../models/InventoryItem.js';
import { hashPassword } from '../services/auth.service.js';

const CLEAN = process.argv.includes('--clean');

const PASS = 'TestPass123!';

const USERS = {
  super_admin: { email: 'admin@test.local', systemRole: 'super_admin' },
  tenant_admin: { email: 'tadmin@testschool.local' },
  teacher: { email: 'teacher@testschool.local' },
  viewer: { email: 'viewer@testschool.local' },
};

async function upsertUser(data) {
  const hash = await hashPassword(PASS);
  return User.findOneAndUpdate(
    { email: data.email },
    {
      $setOnInsert: {
        email: data.email,
        passwordHash: hash,
        systemRole: data.systemRole ?? null,
        status: 'active',
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true, _bypassTenantScope: true }
  ).lean();
}

async function run() {
  await mongoose.connect(env.MONGODB_URI);
  console.error('Connected:', env.MONGODB_URI);

  if (CLEAN) {
    const collections = await mongoose.connection.db.collections();
    await Promise.all(collections.map((c) => c.deleteMany({})));
    console.error('Collections cleared.');
  }

  // ── Users ─────────────────────────────────────────────────────────────────
  const users = {};
  for (const [key, data] of Object.entries(USERS)) {
    users[key] = await upsertUser(data);
  }

  // ── Tenant ────────────────────────────────────────────────────────────────
  let tenant = await Tenant.findOne({ subdomain: 'testschool' }).lean();
  if (!tenant) {
    tenant = await Tenant.create({
      name: 'Test School',
      subdomain: 'testschool',
      plan: 'pro',
      status: 'active',
      locale: 'en',
      timezone: 'Asia/Kolkata',
      currency: 'INR',
    });
    tenant = tenant.toObject();
  }
  const tenantId = tenant._id;

  // ── Roles ─────────────────────────────────────────────────────────────────
  const existingRoles = await Role.find({ tenantId }, null, { _bypassTenantScope: true }).lean();
  let roles = existingRoles;
  if (existingRoles.length === 0) {
    const entries = Object.entries(DEFAULT_ROLE_TEMPLATES).map(([key, permissions]) => ({
      tenantId,
      name: key.replace('_', ' '),
      permissions,
      isTemplate: true,
      templateKey: key,
    }));
    roles = await Role.insertMany(entries);
  }

  const roleByKey = Object.fromEntries(roles.map((r) => [r.templateKey, r]));

  // ── Memberships ───────────────────────────────────────────────────────────
  const membershipMap = {
    tenant_admin: roleByKey['tenant_admin'],
    teacher: roleByKey['teacher'],
    viewer: roleByKey['librarian'], // use librarian as minimal-permission viewer
  };

  for (const [key, role] of Object.entries(membershipMap)) {
    await TenantMembership.findOneAndUpdate(
      { tenantId, userId: users[key]._id },
      {
        $setOnInsert: {
          tenantId,
          userId: users[key]._id,
          roleIds: [role._id],
          status: 'active',
        },
      },
      { upsert: true, _bypassTenantScope: true }
    );
  }

  // ── Academic Year ─────────────────────────────────────────────────────────
  let year = await AcademicYear.findOne({ tenantId, name: '2025-26' }, null, { _bypassTenantScope: true }).lean();
  if (!year) {
    year = await AcademicYear.create({ tenantId, name: '2025-26', startDate: new Date('2025-04-01'), endDate: new Date('2026-03-31'), isActive: true });
    year = year.toObject();
  }

  // ── Term ──────────────────────────────────────────────────────────────────
  let term = await Term.findOne({ tenantId, name: 'Term 1' }, null, { _bypassTenantScope: true }).lean();
  if (!term) {
    term = await Term.create({ tenantId, academicYearId: year._id, name: 'Term 1', startDate: new Date('2025-04-01'), endDate: new Date('2025-09-30') });
    term = term.toObject();
  }

  // ── Class ─────────────────────────────────────────────────────────────────
  let cls = await Class.findOne({ tenantId, name: 'Grade 5' }, null, { _bypassTenantScope: true }).lean();
  if (!cls) {
    cls = await Class.create({ tenantId, name: 'Grade 5', gradeLevel: 5 });
    cls = cls.toObject();
  }

  // ── Section ───────────────────────────────────────────────────────────────
  let section = await Section.findOne({ tenantId, classId: cls._id, name: 'A' }, null, { _bypassTenantScope: true }).lean();
  if (!section) {
    section = await Section.create({ tenantId, classId: cls._id, name: 'A' });
    section = section.toObject();
  }

  // ── Subjects ──────────────────────────────────────────────────────────────
  const subjectDefs = [
    { name: 'Mathematics', code: 'MATH5' },
    { name: 'English', code: 'ENG5' },
    { name: 'Science', code: 'SCI5' },
  ];
  const subjects = [];
  for (const def of subjectDefs) {
    let sub = await Subject.findOne({ tenantId, classId: cls._id, code: def.code }, null, { _bypassTenantScope: true }).lean();
    if (!sub) {
      sub = await Subject.create({ tenantId, classId: cls._id, name: def.name, code: def.code, creditHours: 5 });
      sub = sub.toObject();
    }
    subjects.push(sub);
  }

  // ── Students ──────────────────────────────────────────────────────────────
  const students = [];
  for (let i = 1; i <= 10; i++) {
    const admissionNo = `2025-TEST-${String(i).padStart(3, '0')}`;
    let student = await Student.findOne({ tenantId, admissionNo }, null, { _bypassTenantScope: true }).lean();
    if (!student) {
      student = await Student.create({
        tenantId,
        admissionNo,
        firstName: `Student${i}`,
        lastName: 'Test',
        sectionId: section._id,
        gender: i % 2 === 0 ? 'female' : 'male',
        status: 'active',
      });
      student = student.toObject();
    }
    students.push(student);
  }

  // ── Staff Members (linked to tenant users) ───────────────────────────────
  const staffData = [
    { employeeId: 'EMP-TEST-001', userId: users.teacher._id, firstName: 'Alice', lastName: 'Smith', designation: 'Teacher', department: 'Academics' },
    { employeeId: 'EMP-TEST-002', userId: users.viewer._id, firstName: 'Bob', lastName: 'Jones', designation: 'Accountant', department: 'Finance' },
  ];
  const staffMembers = [];
  for (const data of staffData) {
    let staff = await StaffMember.findOne({ tenantId, employeeId: data.employeeId }, null, { _bypassTenantScope: true }).lean();
    if (!staff) {
      staff = await StaffMember.create({ tenantId, ...data, status: 'active', joiningDate: new Date('2020-06-01') });
      staff = staff.toObject();
    }
    staffMembers.push(staff);
  }

  // ── Leave Type ────────────────────────────────────────────────────────────
  let leaveType = await LeaveType.findOne({ tenantId, name: 'Annual Leave' }, null, { _bypassTenantScope: true }).lean();
  if (!leaveType) {
    leaveType = await LeaveType.create({ tenantId, name: 'Annual Leave', maxDaysPerYear: 20, isPaid: true });
    leaveType = leaveType.toObject();
  }

  // ── Salary Structure ──────────────────────────────────────────────────────
  let salaryStructure = await SalaryStructure.findOne({ tenantId, name: 'Basic Structure' }, null, { _bypassTenantScope: true }).lean();
  if (!salaryStructure) {
    salaryStructure = await SalaryStructure.create({
      tenantId,
      name: 'Basic Structure',
      components: [
        { label: 'Basic', type: 'earning', amount: 30000, isPercentage: false },
        { label: 'HRA', type: 'earning', amount: 40, isPercentage: true },
      ],
    });
    salaryStructure = salaryStructure.toObject();
  }

  // ── Cost Center ───────────────────────────────────────────────────────────
  let costCenter = await CostCenter.findOne({ tenantId, name: 'General' }, null, { _bypassTenantScope: true }).lean();
  if (!costCenter) {
    costCenter = await CostCenter.create({ tenantId, name: 'General', code: 'GEN' });
    costCenter = costCenter.toObject();
  }

  // ── Fee Structure ─────────────────────────────────────────────────────────
  let feeStructure = await FeeStructure.findOne({ tenantId, name: 'Standard Fee' }, null, { _bypassTenantScope: true }).lean();
  if (!feeStructure) {
    feeStructure = await FeeStructure.create({
      tenantId,
      name: 'Standard Fee',
      academicYearId: year._id,
      components: [{ label: 'Tuition', amount: 5000 }, { label: 'Activity', amount: 500 }],
    });
    feeStructure = feeStructure.toObject();
  }

  // ── Inventory Items ───────────────────────────────────────────────────────
  const inventoryItems = [];

  const consumableData = [
    { sku: 'INV-TEST-001', name: 'Whiteboard Marker', category: 'stationery', quantity: 100, reorderLevel: 20, unitCost: 10 },
    { sku: 'INV-TEST-003', name: 'Notebook A4', category: 'stationery', quantity: 500, reorderLevel: 50, unitCost: 30 },
  ];
  for (const data of consumableData) {
    let item = await Consumable.findOne({ tenantId, sku: data.sku }, null, { _bypassTenantScope: true }).lean();
    if (!item) {
      item = await Consumable.create({ tenantId, ...data });
      item = item.toObject();
    }
    inventoryItems.push(item);
  }

  let projector = await FixedAsset.findOne({ tenantId, sku: 'INV-TEST-002' }, null, { _bypassTenantScope: true }).lean();
  if (!projector) {
    projector = await FixedAsset.create({
      tenantId,
      sku: 'INV-TEST-002',
      name: 'Projector',
      category: 'electronics',
      unitCost: 25000,
      purchaseDate: new Date('2024-01-15'),
      usefulLifeYears: 5,
    });
    projector = projector.toObject();
  }
  inventoryItems.push(projector);

  await mongoose.disconnect();

  // Output seeded IDs as JSON for fixtures to consume
  const result = {
    users: Object.fromEntries(Object.entries(users).map(([k, u]) => [k, { _id: u._id.toString(), email: u.email }])),
    tenant: { _id: tenantId.toString(), subdomain: 'testschool' },
    roles: Object.fromEntries(Object.entries(roleByKey).map(([k, r]) => [k, r._id.toString()])),
    academicYear: { _id: year._id.toString() },
    term: { _id: term._id.toString() },
    class: { _id: cls._id.toString() },
    section: { _id: section._id.toString() },
    subjects: subjects.map((s) => ({ _id: s._id.toString(), name: s.name })),
    students: students.map((s) => ({ _id: s._id.toString(), admissionNo: s.admissionNo })),
    staffMembers: staffMembers.map((s) => ({ _id: s._id.toString(), employeeId: s.employeeId })),
    leaveType: { _id: leaveType._id.toString() },
    salaryStructure: { _id: salaryStructure._id.toString() },
    costCenter: { _id: costCenter._id.toString() },
    feeStructure: { _id: feeStructure._id.toString() },
    inventoryItems: inventoryItems.map((i) => ({ _id: i._id.toString(), sku: i.sku })),
  };

  // Write to disk so Playwright fixtures can read seeded IDs
  const { writeFileSync, mkdirSync, existsSync } = await import('fs');
  const { resolve, dirname } = await import('path');
  const outPath = process.env.SEED_OUTPUT_PATH
    || resolve(import.meta.dirname, '../../../web/tests/seed/.test-ids.json');
  try {
    const dir = dirname(outPath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(outPath, JSON.stringify(result, null, 2));
    console.error('Seed IDs written to:', outPath);
  } catch (e) {
    console.error('Could not write seed IDs to file:', e.message);
  }

  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}

run().catch((err) => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});
