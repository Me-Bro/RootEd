/**
 * seed-demo-data.js — adds realistic demo data (real names, no "TestN" placeholders)
 * to the existing `testschool` tenant, on top of whatever seed-test-data.js already put there.
 *
 * Usage (run inside the api container so it resolves the `mongo` service hostname):
 *   docker compose -f docker-compose.local.yml exec api node src/scripts/seed-demo-data.js
 *
 * Idempotent: safe to re-run — every entity is looked up by its unique key first.
 * Removes the 10 placeholder "StudentN Test" records (and their grades) from
 * seed-test-data.js before adding the real dataset, so the UI doesn't show both.
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
import { Grade } from '../models/Grade.js';
import { StaffMember } from '../models/StaffMember.js';
import { AttendanceRecord } from '../models/AttendanceRecord.js';
import { LeaveType, DEFAULT_LEAVE_TYPES } from '../models/LeaveType.js';
import { LeaveBalance } from '../models/LeaveBalance.js';
import { LeaveRequest } from '../models/LeaveRequest.js';
import { SalaryStructure } from '../models/SalaryStructure.js';
import { SalarySlip } from '../models/SalarySlip.js';
import { CostCenter } from '../models/CostCenter.js';
import { FeeStructure } from '../models/FeeStructure.js';
import { FeeAssignment } from '../models/FeeAssignment.js';
import { FeePayment } from '../models/FeePayment.js';
import { Consumable, FixedAsset } from '../models/InventoryItem.js';
import { ExpenseEntry } from '../models/ExpenseEntry.js';
import { PurchaseRequisition } from '../models/PurchaseRequisition.js';
import { hashPassword } from '../services/auth.service.js';

const BYPASS = { _bypassTenantScope: true };
const PASS = 'TestPass123!';

const MALE_FIRST = [
  'Aarav',
  'Vihaan',
  'Aditya',
  'Vivaan',
  'Arjun',
  'Sai',
  'Reyansh',
  'Krishna',
  'Ishaan',
  'Rohan',
  'Karthik',
  'Aryan',
  'Dhruv',
  'Kabir',
  'Yash',
  'Rahul',
  'Nikhil',
  'Siddharth',
  'Varun',
  'Akash',
  'Manav',
  'Devansh',
  'Harsh',
  'Om',
  'Ansh',
  'Vedant',
  'Raghav',
  'Pranav',
  'Aarush',
  'Shaurya',
];
const FEMALE_FIRST = [
  'Ananya',
  'Diya',
  'Ishita',
  'Aadhya',
  'Myra',
  'Saanvi',
  'Aditi',
  'Kavya',
  'Riya',
  'Anika',
  'Meera',
  'Pooja',
  'Neha',
  'Priya',
  'Tanvi',
  'Sneha',
  'Shreya',
  'Nisha',
  'Divya',
  'Isha',
  'Trisha',
  'Radhika',
  'Aarohi',
  'Navya',
  'Prisha',
  'Vanya',
  'Zara',
  'Kiara',
  'Avni',
  'Palak',
];
const SURNAMES = [
  'Sharma',
  'Verma',
  'Gupta',
  'Iyer',
  'Nair',
  'Menon',
  'Reddy',
  'Rao',
  'Patel',
  'Shah',
  'Mehta',
  'Kapoor',
  'Malhotra',
  'Chatterjee',
  'Banerjee',
  'Mukherjee',
  'Desai',
  'Joshi',
  'Kulkarni',
  'Pillai',
  'Naidu',
  'Chauhan',
  'Bhatt',
  'Agarwal',
  'Singh',
  'Kumar',
  'Das',
  'Bose',
  'Nambiar',
  'Krishnan',
];
const ALL_FIRST = [...MALE_FIRST, ...FEMALE_FIRST]; // index < 30 = male, >= 30 = female

function personName(i) {
  const firstName = ALL_FIRST[i % ALL_FIRST.length];
  const lastName = SURNAMES[(i + Math.floor(i / ALL_FIRST.length)) % SURNAMES.length];
  const gender = i % ALL_FIRST.length < MALE_FIRST.length ? 'male' : 'female';
  return { firstName, lastName, gender };
}

function slugEmail(firstName, lastName, usedEmails) {
  let base = `${firstName}.${lastName}`.toLowerCase();
  let email = `${base}@testschool.local`;
  let n = 1;
  while (usedEmails.has(email)) {
    email = `${base}${n}@testschool.local`;
    n++;
  }
  usedEmails.add(email);
  return email;
}

function scoreToLetter(score) {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

async function upsertUser(email, systemRole = null) {
  const hash = await hashPassword(PASS);
  return User.findOneAndUpdate(
    { email },
    { $setOnInsert: { email, passwordHash: hash, systemRole, status: 'active' } },
    { upsert: true, new: true, setDefaultsOnInsert: true, ...BYPASS }
  ).lean();
}

async function upsertMembership(tenantId, userId, roleId) {
  await TenantMembership.findOneAndUpdate(
    { tenantId, userId },
    { $setOnInsert: { tenantId, userId, roleIds: [roleId], status: 'active' } },
    { upsert: true, ...BYPASS }
  );
}

async function run() {
  await mongoose.connect(env.MONGODB_URI);
  console.error('Connected:', env.MONGODB_URI);

  const tenant = await Tenant.findOne({ subdomain: 'testschool' }).lean();
  if (!tenant) {
    throw new Error('Tenant "testschool" not found — run seed-test-data.js first.');
  }
  const tenantId = tenant._id;

  // ── Roles (reuse, create if missing) ─────────────────────────────────────
  let roles = await Role.find({ tenantId }, null, BYPASS).lean();
  if (roles.length === 0) {
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

  // ── Remove placeholder "StudentN Test" data from seed-test-data.js ───────
  const placeholderStudents = await Student.find(
    { tenantId, lastName: 'Test' },
    null,
    BYPASS
  ).lean();
  if (placeholderStudents.length) {
    const ids = placeholderStudents.map((s) => s._id);
    await Grade.deleteMany({ tenantId, studentId: { $in: ids } }, BYPASS);
    await Student.deleteMany({ tenantId, _id: { $in: ids } }, BYPASS);
    console.error(`Removed ${ids.length} placeholder students.`);
  }

  // ── Academic Year & Term (reuse) ──────────────────────────────────────────
  let year = await AcademicYear.findOne({ tenantId, name: '2025-26' }, null, BYPASS).lean();
  if (!year) {
    year = (
      await AcademicYear.create({
        tenantId,
        name: '2025-26',
        startDate: new Date('2025-04-01'),
        endDate: new Date('2026-03-31'),
        isActive: true,
      })
    ).toObject();
  }
  let term = await Term.findOne({ tenantId, name: 'Term 1' }, null, BYPASS).lean();
  if (!term) {
    term = (
      await Term.create({
        tenantId,
        academicYearId: year._id,
        name: 'Term 1',
        startDate: new Date('2025-04-01'),
        endDate: new Date('2025-09-30'),
      })
    ).toObject();
  }

  // ── Classes (Grade 1–10) + Sections (A, B) ───────────────────────────────
  const classes = [];
  const sections = []; // { classId, gradeLevel, doc }
  for (let g = 1; g <= 10; g++) {
    const name = `Grade ${g}`;
    let cls = await Class.findOne({ tenantId, name }, null, BYPASS).lean();
    if (!cls) {
      cls = (await Class.create({ tenantId, name, gradeLevel: g })).toObject();
    }
    classes.push(cls);
    for (const secName of ['A', 'B']) {
      let sec = await Section.findOne(
        { tenantId, classId: cls._id, name: secName },
        null,
        BYPASS
      ).lean();
      if (!sec) {
        sec = (await Section.create({ tenantId, classId: cls._id, name: secName })).toObject();
      }
      sections.push({ classId: cls._id, gradeLevel: g, doc: sec });
    }
  }

  // ── Subjects per class ────────────────────────────────────────────────────
  const subjectDefs = [
    { name: 'Mathematics', prefix: 'MATH' },
    { name: 'English', prefix: 'ENG' },
    { name: 'Science', prefix: 'SCI' },
    { name: 'Social Studies', prefix: 'SST' },
  ];
  const subjectsByClass = new Map(); // classId -> [subject docs]
  for (const cls of classes) {
    const subs = [];
    for (const def of subjectDefs) {
      const code = `${def.prefix}${cls.gradeLevel}`;
      let sub = await Subject.findOne({ tenantId, code }, null, BYPASS).lean();
      if (!sub) {
        sub = (
          await Subject.create({
            tenantId,
            classId: cls._id,
            name: def.name,
            code,
            creditHours: 5,
          })
        ).toObject();
      }
      subs.push(sub);
    }
    subjectsByClass.set(cls._id.toString(), subs);
  }

  // ── Roles helper: teacher/principal/accountant ───────────────────────────
  const usedEmails = new Set();
  const existingUsers = await User.find({}, 'email', BYPASS).lean();
  existingUsers.forEach((u) => usedEmails.add(u.email));

  const DEPARTMENTS = ['Mathematics', 'English', 'Science', 'Social Studies', 'Physical Education'];

  // ── 20 Teachers, one assigned as class teacher per section ───────────────
  const teachers = [];
  for (let i = 0; i < 20; i++) {
    const { firstName, lastName, gender } = personName(i);
    const email = slugEmail(firstName, lastName, usedEmails);
    const user = await upsertUser(email);
    await upsertMembership(tenantId, user._id, roleByKey['teacher']._id);

    const employeeId = `STF2026-${String(i + 1).padStart(3, '0')}`;
    let staff = await StaffMember.findOne({ tenantId, employeeId }, null, BYPASS).lean();
    if (!staff) {
      staff = (
        await StaffMember.create({
          tenantId,
          userId: user._id,
          employeeId,
          firstName,
          lastName,
          gender,
          phone: `+91-9${String(100000000 + i * 137).slice(0, 9)}`,
          designation: 'Teacher',
          department: DEPARTMENTS[i % DEPARTMENTS.length],
          joiningDate: new Date(`2022-0${(i % 6) + 1}-01`),
          employmentStatus: 'active',
        })
      ).toObject();
    }
    teachers.push({ user, staff, firstName, lastName });

    // assign as class teacher to the i-th section (20 teachers, 20 sections)
    const sec = sections[i];
    if (sec && !sec.doc.classTeacherId) {
      await Section.updateOne({ _id: sec.doc._id }, { $set: { classTeacherId: user._id } }, BYPASS);
      sec.doc.classTeacherId = user._id;
    }
  }

  // ── Principal + Accountant ────────────────────────────────────────────────
  const principalName = personName(200);
  const principalEmail = slugEmail(principalName.firstName, principalName.lastName, usedEmails);
  const principalUser = await upsertUser(principalEmail);
  await upsertMembership(tenantId, principalUser._id, roleByKey['principal']._id);
  let principalStaff = await StaffMember.findOne(
    { tenantId, employeeId: 'STF2026-P01' },
    null,
    BYPASS
  ).lean();
  if (!principalStaff) {
    principalStaff = (
      await StaffMember.create({
        tenantId,
        userId: principalUser._id,
        employeeId: 'STF2026-P01',
        firstName: principalName.firstName,
        lastName: principalName.lastName,
        gender: principalName.gender,
        designation: 'Principal',
        department: 'Administration',
        joiningDate: new Date('2019-06-01'),
        employmentStatus: 'active',
      })
    ).toObject();
  }

  const accountantName = personName(201);
  const accountantEmail = slugEmail(accountantName.firstName, accountantName.lastName, usedEmails);
  const accountantUser = await upsertUser(accountantEmail);
  await upsertMembership(tenantId, accountantUser._id, roleByKey['accountant']._id);
  let accountantStaff = await StaffMember.findOne(
    { tenantId, employeeId: 'STF2026-A01' },
    null,
    BYPASS
  ).lean();
  if (!accountantStaff) {
    accountantStaff = (
      await StaffMember.create({
        tenantId,
        userId: accountantUser._id,
        employeeId: 'STF2026-A01',
        firstName: accountantName.firstName,
        lastName: accountantName.lastName,
        gender: accountantName.gender,
        designation: 'Accountant',
        department: 'Finance',
        joiningDate: new Date('2021-01-15'),
        employmentStatus: 'active',
      })
    ).toObject();
  }

  const allStaff = [...teachers.map((t) => t.staff), principalStaff, accountantStaff];

  // ── 100 Students, 5 per section, across Grade 1–10 ────────────────────────
  const students = [];
  for (let i = 0; i < 100; i++) {
    const { firstName, lastName, gender } = personName(i + 40); // offset so students != teacher names mostly
    const admissionNo = `ADM2026-${String(i + 1).padStart(4, '0')}`;
    const sec = sections[i % sections.length];
    let student = await Student.findOne({ tenantId, admissionNo }, null, BYPASS).lean();
    if (!student) {
      const age = 5 + sec.gradeLevel;
      student = (
        await Student.create({
          tenantId,
          admissionNo,
          firstName,
          lastName,
          sectionId: sec.doc._id,
          dateOfBirth: new Date(2025 - age, i % 12, (i % 27) + 1),
          gender,
          parentContacts: [
            {
              name: `${SURNAMES[(i + 3) % SURNAMES.length]} ${gender === 'male' ? 'Father' : 'Mother'} of ${firstName}`.replace(
                /^\S+ /,
                ''
              ),
              phone: `+91-9${String(200000000 + i * 91).slice(0, 9)}`,
              relation: i % 2 === 0 ? 'Father' : 'Mother',
            },
          ],
          status: 'active',
        })
      ).toObject();
    }
    students.push({ ...student, gradeLevel: sec.gradeLevel, classId: sec.classId });
  }

  // ── Grades (per student, per subject of their class) ─────────────────────
  for (const student of students) {
    const subs = subjectsByClass.get(student.classId.toString()) || [];
    for (const subject of subs) {
      const score = 55 + ((student.admissionNo.length * 7 + subject.code.length * 3) % 44);
      const exists = await Grade.findOne(
        { tenantId, studentId: student._id, subjectId: subject._id, termId: term._id },
        null,
        BYPASS
      ).lean();
      if (!exists) {
        await Grade.create({
          tenantId,
          studentId: student._id,
          subjectId: subject._id,
          termId: term._id,
          academicYearId: year._id,
          score,
          letterGrade: scoreToLetter(score),
          weightage: 1,
          gradedBy: teachers[0].user._id,
        });
      }
    }
  }
  console.error(`Grades ensured for ${students.length} students.`);

  // ── Attendance — one school week (within Term 1) ──────────────────────────
  const attendanceDates = [
    new Date('2025-08-11'),
    new Date('2025-08-12'),
    new Date('2025-08-13'),
    new Date('2025-08-14'),
    new Date('2025-08-15'),
  ];
  for (const student of students) {
    const sec = sections.find((s) => s.doc._id.equals(student.sectionId));
    const markedBy = sec?.doc.classTeacherId || teachers[0].user._id;
    for (const [dayIdx, date] of attendanceDates.entries()) {
      const roll = (Number(student.admissionNo.slice(-4)) + dayIdx) % 10;
      const status = roll === 0 ? 'absent' : roll === 1 ? 'late' : 'present';
      await AttendanceRecord.findOneAndUpdate(
        { tenantId, date, entityType: 'student', entityId: student._id },
        {
          $setOnInsert: {
            tenantId,
            date,
            entityType: 'student',
            entityId: student._id,
            sectionId: student.sectionId,
            status,
            markedBy,
          },
        },
        { upsert: true, ...BYPASS }
      );
    }
  }
  console.error(
    `Attendance ensured for ${students.length} students x ${attendanceDates.length} days.`
  );

  // ── Leave types (reuse "Annual Leave", add Casual/Sick from defaults) ────
  let annualLeave = await LeaveType.findOne(
    { tenantId, name: 'Annual Leave' },
    null,
    BYPASS
  ).lean();
  if (!annualLeave) {
    annualLeave = (
      await LeaveType.create({ tenantId, name: 'Annual Leave', maxDaysPerYear: 20, isPaid: true })
    ).toObject();
  }
  const extraLeaveTypes = [];
  for (const def of DEFAULT_LEAVE_TYPES.filter((d) => d.name === 'Casual' || d.name === 'Sick')) {
    let lt = await LeaveType.findOne({ tenantId, name: def.name }, null, BYPASS).lean();
    if (!lt) {
      lt = (await LeaveType.create({ tenantId, ...def })).toObject();
    }
    extraLeaveTypes.push(lt);
  }
  const allLeaveTypes = [annualLeave, ...extraLeaveTypes];

  // ── Leave balances for every staff member, every leave type, 2025 ────────
  for (const staff of allStaff) {
    for (const lt of allLeaveTypes) {
      await LeaveBalance.findOneAndUpdate(
        { tenantId, staffId: staff._id, leaveTypeId: lt._id, year: 2025 },
        {
          $setOnInsert: {
            tenantId,
            staffId: staff._id,
            leaveTypeId: lt._id,
            year: 2025,
            total: lt.maxDaysPerYear,
            used: lt.maxDaysPerYear > 15 ? 3 : 1,
          },
        },
        { upsert: true, ...BYPASS }
      );
    }
  }
  console.error(`Leave balances ensured for ${allStaff.length} staff.`);

  // ── A handful of example leave requests ──────────────────────────────────
  const leaveExamples = [
    {
      staff: teachers[0].staff,
      lt: annualLeave,
      from: '2025-06-10',
      to: '2025-06-12',
      status: 'approved',
    },
    {
      staff: teachers[1].staff,
      lt: extraLeaveTypes[1] || annualLeave,
      from: '2025-07-02',
      to: '2025-07-02',
      status: 'pending',
    },
    {
      staff: teachers[2].staff,
      lt: extraLeaveTypes[0] || annualLeave,
      from: '2025-08-05',
      to: '2025-08-06',
      status: 'rejected',
    },
  ];
  for (const ex of leaveExamples) {
    const fromDate = new Date(ex.from);
    const toDate = new Date(ex.to);
    const totalDays = Math.round((toDate - fromDate) / 86400000) + 1;
    const exists = await LeaveRequest.findOne(
      { tenantId, staffId: ex.staff._id, fromDate },
      null,
      BYPASS
    ).lean();
    if (!exists) {
      await LeaveRequest.create({
        tenantId,
        staffId: ex.staff._id,
        leaveTypeId: ex.lt._id,
        fromDate,
        toDate,
        totalDays,
        reason: 'Personal',
        status: ex.status,
        approvalChain: [
          {
            approverId: principalUser._id,
            status: ex.status === 'pending' ? 'pending' : ex.status,
            actedAt: ex.status === 'pending' ? undefined : new Date(ex.from),
          },
        ],
        currentApproverIndex: ex.status === 'pending' ? 0 : 1,
      });
    }
  }
  console.error('Example leave requests ensured.');

  // ── Salary structure (reuse), salary slips for every staff member ────────
  let salaryStructure = await SalaryStructure.findOne(
    { tenantId, name: 'Basic Structure' },
    null,
    BYPASS
  ).lean();
  if (!salaryStructure) {
    salaryStructure = (
      await SalaryStructure.create({
        tenantId,
        name: 'Basic Structure',
        components: [
          { label: 'Basic', type: 'earning', amount: 30000, isPercentage: false },
          { label: 'HRA', type: 'earning', amount: 40, isPercentage: true },
        ],
      })
    ).toObject();
  }
  await StaffMember.updateMany(
    { tenantId, _id: { $in: allStaff.map((s) => s._id) }, salaryStructureId: { $exists: false } },
    { $set: { salaryStructureId: salaryStructure._id } },
    BYPASS
  );

  const BASE_PAY = { Teacher: 35000, Principal: 90000, Accountant: 48000 };
  for (const staff of allStaff) {
    const basic = BASE_PAY[staff.designation] || 35000;
    const hra = Math.round(basic * 0.4);
    const gross = basic + hra;
    await SalarySlip.findOneAndUpdate(
      { tenantId, staffId: staff._id, month: 8, year: 2025 },
      {
        $setOnInsert: {
          tenantId,
          staffId: staff._id,
          month: 8,
          year: 2025,
          components: [
            { label: 'Basic', type: 'earning', amount: basic },
            { label: 'HRA', type: 'earning', amount: hra },
          ],
          grossEarnings: gross,
          totalDeductions: 0,
          netPay: gross,
          status: 'generated',
        },
      },
      { upsert: true, ...BYPASS }
    );
  }
  console.error(`Salary slips ensured for ${allStaff.length} staff.`);

  // ── Cost centers ──────────────────────────────────────────────────────────
  const costCenterDefs = [
    { name: 'General', code: 'GEN', budget: 500000 },
    { name: 'Academics', code: 'ACAD', budget: 300000 },
    { name: 'Facilities', code: 'FAC', budget: 200000 },
  ];
  const costCenters = [];
  for (const def of costCenterDefs) {
    let cc = await CostCenter.findOne({ tenantId, code: def.code }, null, BYPASS).lean();
    if (!cc) {
      cc = (await CostCenter.create({ tenantId, ...def })).toObject();
    }
    costCenters.push(cc);
  }

  // ── Fee structure (reuse), fee assignments + payments for every student ──
  let feeStructure = await FeeStructure.findOne(
    { tenantId, name: 'Standard Fee' },
    null,
    BYPASS
  ).lean();
  if (!feeStructure) {
    feeStructure = (
      await FeeStructure.create({
        tenantId,
        name: 'Standard Fee',
        academicYearId: year._id,
        components: [
          { label: 'Tuition', amount: 5000 },
          { label: 'Activity', amount: 500 },
        ],
      })
    ).toObject();
  }
  const totalFee = feeStructure.components.reduce((sum, c) => sum + c.amount, 0);
  const PAYMENT_METHODS = ['cash', 'card', 'upi', 'bank_transfer', 'cheque'];
  let receiptSeq = 1;
  let paidCount = 0;
  for (const [idx, student] of students.entries()) {
    let assignment = await FeeAssignment.findOne(
      { tenantId, studentId: student._id, academicYearId: year._id },
      null,
      BYPASS
    ).lean();
    if (!assignment) {
      const bucket = idx % 20; // 0-11 paid, 12-16 partial, 17-19 unpaid
      const status = bucket < 12 ? 'paid' : bucket < 17 ? 'partial' : 'unpaid';
      assignment = (
        await FeeAssignment.create({
          tenantId,
          studentId: student._id,
          feeStructureId: feeStructure._id,
          academicYearId: year._id,
          totalAmount: totalFee,
          dueDate: new Date('2025-07-15'),
          status,
        })
      ).toObject();

      if (status !== 'unpaid') {
        const amount = status === 'paid' ? totalFee : Math.round(totalFee / 2);
        await FeePayment.create({
          tenantId,
          assignmentId: assignment._id,
          studentId: student._id,
          amount,
          paymentMethod: PAYMENT_METHODS[idx % PAYMENT_METHODS.length],
          receiptNumber: `RCPT-2025-${String(receiptSeq++).padStart(4, '0')}`,
          paymentDate: new Date('2025-07-20'),
          collectedBy: accountantUser._id,
        });
        paidCount++;
      }
    }
  }
  console.error(
    `Fee assignments ensured for ${students.length} students (${paidCount} with a payment).`
  );

  // ── Inventory items ───────────────────────────────────────────────────────
  const consumableDefs = [
    {
      sku: 'CON-1001',
      name: 'Whiteboard Marker',
      category: 'stationery',
      quantity: 300,
      reorderLevel: 50,
      unitCost: 10,
    },
    {
      sku: 'CON-1002',
      name: 'Notebook A4',
      category: 'stationery',
      quantity: 800,
      reorderLevel: 100,
      unitCost: 30,
    },
    {
      sku: 'CON-1003',
      name: 'Chalk Box',
      category: 'stationery',
      quantity: 150,
      reorderLevel: 30,
      unitCost: 15,
    },
    {
      sku: 'CON-1004',
      name: 'Lab Chemicals Kit',
      category: 'lab',
      quantity: 40,
      reorderLevel: 10,
      unitCost: 450,
    },
  ];
  for (const def of consumableDefs) {
    const exists = await Consumable.findOne({ tenantId, sku: def.sku }, null, BYPASS).lean();
    if (!exists) await Consumable.create({ tenantId, ...def, custodianId: accountantUser._id });
  }
  const fixedAssetDefs = [
    {
      sku: 'FA-2001',
      name: 'Projector',
      category: 'electronics',
      unitCost: 25000,
      purchaseDate: new Date('2024-01-15'),
      usefulLifeYears: 5,
    },
    {
      sku: 'FA-2002',
      name: 'Desktop Computer',
      category: 'electronics',
      unitCost: 40000,
      purchaseDate: new Date('2023-11-01'),
      usefulLifeYears: 4,
    },
    {
      sku: 'FA-2003',
      name: 'Library Bookshelf',
      category: 'furniture',
      unitCost: 8000,
      purchaseDate: new Date('2022-06-01'),
      usefulLifeYears: 10,
    },
    {
      sku: 'FA-2004',
      name: 'Sports Equipment Set',
      category: 'sports',
      unitCost: 15000,
      purchaseDate: new Date('2024-03-10'),
      usefulLifeYears: 6,
    },
  ];
  const fixedAssets = [];
  for (const def of fixedAssetDefs) {
    let fa = await FixedAsset.findOne({ tenantId, sku: def.sku }, null, BYPASS).lean();
    if (!fa) {
      fa = (
        await FixedAsset.create({ tenantId, ...def, custodianId: accountantUser._id })
      ).toObject();
    }
    fixedAssets.push(fa);
  }
  console.error('Inventory items ensured.');

  // ── Expense entries ────────────────────────────────────────────────────────
  const expenseDefs = [
    { title: 'Electricity Bill — August', category: 'utilities', amount: 18500, status: 'paid' },
    { title: 'Stationery Bulk Purchase', category: 'supplies', amount: 12000, status: 'approved' },
    { title: 'Sports Day Equipment', category: 'sports', amount: 22000, status: 'pending' },
  ];
  for (const def of expenseDefs) {
    const exists = await ExpenseEntry.findOne({ tenantId, title: def.title }, null, BYPASS).lean();
    if (!exists) {
      await ExpenseEntry.create({
        tenantId,
        title: def.title,
        category: def.category,
        amount: def.amount,
        paymentMethod: 'bank_transfer',
        vendor: 'Local Vendor Pvt Ltd',
        invoiceDate: new Date('2025-08-01'),
        costCenterId: costCenters[0]._id,
        submittedBy: accountantUser._id,
        status: def.status,
        approvalChain: [
          {
            approverId: principalUser._id,
            role: 'principal',
            status: def.status === 'pending' ? 'pending' : 'approved',
            actedAt: def.status === 'pending' ? undefined : new Date('2025-08-02'),
          },
        ],
        currentApproverIndex: def.status === 'pending' ? 0 : 1,
        paidAt: def.status === 'paid' ? new Date('2025-08-03') : undefined,
      });
    }
  }
  console.error('Example expense entries ensured.');

  // ── Purchase requisitions ──────────────────────────────────────────────────
  const prDefs = [
    { itemSku: 'CON-1002', quantity: 200, reason: 'Restock for new term', status: 'pending' },
    { itemSku: 'FA-2002', quantity: 5, reason: 'Computer lab expansion', status: 'approved' },
  ];
  for (const def of prDefs) {
    const item =
      (await Consumable.findOne({ tenantId, sku: def.itemSku }, null, BYPASS).lean()) ||
      fixedAssets.find((f) => f.sku === def.itemSku);
    if (!item) continue;
    const exists = await PurchaseRequisition.findOne(
      { tenantId, itemId: item._id, reason: def.reason },
      null,
      BYPASS
    ).lean();
    if (!exists) {
      await PurchaseRequisition.create({
        tenantId,
        itemId: item._id,
        requestedQuantity: def.quantity,
        reason: def.reason,
        status: def.status,
        requestedBy: accountantUser._id,
        approvedBy: def.status === 'approved' ? principalUser._id : undefined,
      });
    }
  }
  console.error('Example purchase requisitions ensured.');

  await mongoose.disconnect();

  console.log(
    JSON.stringify(
      {
        tenant: 'testschool',
        studentsCreated: students.length,
        teachersCreated: teachers.length,
        principal: { email: principalEmail, password: PASS },
        accountant: { email: accountantEmail, password: PASS },
        sampleTeacherLogins: teachers.slice(0, 5).map((t) => ({
          name: `${t.firstName} ${t.lastName}`,
          email: t.user.email,
          password: PASS,
        })),
      },
      null,
      2
    )
  );
  process.exit(0);
}

run().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
