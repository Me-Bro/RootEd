/**
 * seed-test-data.js — seeds deterministic test data into rooted_test DB.
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
import { Grade } from '../models/Grade.js';
import { ReportCardBatch } from '../models/ReportCardBatch.js';
import { Timetable } from '../models/Timetable.js';
import { TimetablePublish } from '../models/TimetablePublish.js';
import { scoreToLetter } from '@rooted/shared/utils';
import { StaffMember } from '../models/StaffMember.js';
import { LeaveType } from '../models/LeaveType.js';
import { SalaryStructure } from '../models/SalaryStructure.js';
import { CostCenter } from '../models/CostCenter.js';
import { FeeStructure } from '../models/FeeStructure.js';
import { Consumable, FixedAsset } from '../models/InventoryItem.js';
import { AttendanceRecord } from '../models/AttendanceRecord.js';
import { FeeAssignment } from '../models/FeeAssignment.js';
import { FeePayment } from '../models/FeePayment.js';
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

  // AttendanceRecord's unique index gained subjectId (per-period attendance),
  // and Grade's gained assessmentType (multi-assessment support) — deleteMany
  // below doesn't drop indexes, so keep the test DB's indexes in sync with
  // the current schema on every seed run.
  await AttendanceRecord.syncIndexes();
  await Grade.syncIndexes();
  await Timetable.syncIndexes();
  await TimetablePublish.syncIndexes();
  await ReportCardBatch.syncIndexes();

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
  let year = await AcademicYear.findOne({ tenantId, name: '2025-26' }, null, {
    _bypassTenantScope: true,
  }).lean();
  if (!year) {
    year = await AcademicYear.create({
      tenantId,
      name: '2025-26',
      startDate: new Date('2025-04-01'),
      endDate: new Date('2026-03-31'),
      isActive: true,
    });
    year = year.toObject();
  }

  // A second, empty academic year — lets the timetable copy-between-years
  // e2e case start from a genuinely blank grid instead of overwriting 2025-26.
  let nextYear = await AcademicYear.findOne({ tenantId, name: '2026-27' }, null, {
    _bypassTenantScope: true,
  }).lean();
  if (!nextYear) {
    nextYear = await AcademicYear.create({
      tenantId,
      name: '2026-27',
      startDate: new Date('2026-04-01'),
      endDate: new Date('2027-03-31'),
      isActive: false,
    });
    nextYear = nextYear.toObject();
  }

  // ── Term ──────────────────────────────────────────────────────────────────
  let term = await Term.findOne({ tenantId, name: 'Term 1' }, null, {
    _bypassTenantScope: true,
  }).lean();
  if (!term) {
    term = await Term.create({
      tenantId,
      academicYearId: year._id,
      name: 'Term 1',
      startDate: new Date('2025-04-01'),
      endDate: new Date('2025-09-30'),
    });
    term = term.toObject();
  }

  // ── Class ─────────────────────────────────────────────────────────────────
  let cls = await Class.findOne({ tenantId, name: 'Grade 5' }, null, {
    _bypassTenantScope: true,
  }).lean();
  if (!cls) {
    cls = await Class.create({ tenantId, name: 'Grade 5', gradeLevel: 5 });
    cls = cls.toObject();
  }

  // ── Section ───────────────────────────────────────────────────────────────
  let section = await Section.findOne({ tenantId, classId: cls._id, name: 'A' }, null, {
    _bypassTenantScope: true,
  }).lean();
  if (!section) {
    section = await Section.create({ tenantId, classId: cls._id, name: 'A' });
    section = section.toObject();
  }

  // Second section — used by the timetable spec to exercise cross-section
  // teacher/room conflicts and the draft-vs-published visibility filter
  // without touching section A's already-asserted-on data.
  let sectionB = await Section.findOne({ tenantId, classId: cls._id, name: 'B' }, null, {
    _bypassTenantScope: true,
  }).lean();
  if (!sectionB) {
    sectionB = await Section.create({ tenantId, classId: cls._id, name: 'B' });
    sectionB = sectionB.toObject();
  }

  // ── Subjects ──────────────────────────────────────────────────────────────
  const subjectDefs = [
    { name: 'Mathematics', code: 'MATH5' },
    { name: 'English', code: 'ENG5' },
    { name: 'Science', code: 'SCI5' },
  ];
  const subjects = [];
  for (const def of subjectDefs) {
    let sub = await Subject.findOne({ tenantId, classId: cls._id, code: def.code }, null, {
      _bypassTenantScope: true,
    }).lean();
    if (!sub) {
      sub = await Subject.create({
        tenantId,
        classId: cls._id,
        name: def.name,
        code: def.code,
        creditHours: 5,
      });
      sub = sub.toObject();
    }
    subjects.push(sub);
  }

  // ── Students ──────────────────────────────────────────────────────────────
  const students = [];
  for (let i = 1; i <= 10; i++) {
    const admissionNo = `2025-TEST-${String(i).padStart(3, '0')}`;
    let student = await Student.findOne({ tenantId, admissionNo }, null, {
      _bypassTenantScope: true,
    }).lean();
    if (!student) {
      student = await Student.create({
        tenantId,
        admissionNo,
        firstName: `Student${i}`,
        lastName: 'Test',
        sectionId: section._id,
        gender: i % 2 === 0 ? 'female' : 'male',
        status: 'active',
        parentContacts:
          i === 1 ? [{ name: 'Parent One', phone: '9000000001', relation: 'father' }] : [],
      });
      student = student.toObject();
    }
    students.push(student);
  }

  // Extra students covering non-active statuses, for status-change/profile e2e coverage.
  const extraStudentDefs = [
    { admissionNo: '2025-TEST-011', firstName: 'Student11', status: 'withdrawn', gender: 'male' },
    { admissionNo: '2025-TEST-012', firstName: 'Student12', status: 'graduated', gender: 'female' },
  ];
  for (const def of extraStudentDefs) {
    let student = await Student.findOne({ tenantId, admissionNo: def.admissionNo }, null, {
      _bypassTenantScope: true,
    }).lean();
    if (!student) {
      student = await Student.create({
        tenantId,
        admissionNo: def.admissionNo,
        firstName: def.firstName,
        lastName: 'Test',
        sectionId: section._id,
        gender: def.gender,
        status: def.status,
      });
      student = student.toObject();
    }
    students.push(student);
  }
  const activeStudents = students.filter((s) => s.status === 'active');

  // ── Grades ────────────────────────────────────────────────────────────────
  const grades = [];
  for (const student of students) {
    for (const subject of subjects) {
      const score = 60 + ((student.admissionNo.length + subject.code.length) % 40);
      let grade = await Grade.findOne(
        {
          tenantId,
          studentId: student._id,
          subjectId: subject._id,
          termId: term._id,
          assessmentType: 'final',
        },
        null,
        { _bypassTenantScope: true }
      ).lean();
      if (!grade) {
        grade = await Grade.create({
          tenantId,
          studentId: student._id,
          sectionId: student.sectionId,
          subjectId: subject._id,
          termId: term._id,
          academicYearId: year._id,
          assessmentType: 'final',
          score,
          letterGrade: scoreToLetter(score),
          weightage: 1,
          gradedBy: users.teacher._id,
        });
        grade = grade.toObject();
      }
      grades.push(grade);
    }
  }

  // A quiz-type row alongside each student's final grade in Mathematics, so
  // multi-assessment rendering/analytics have more than one row per subject
  // to exercise.
  const mathSubject = subjects.find((s) => s.code === 'MATH5');
  for (const student of students) {
    const admissionNum = parseInt(student.admissionNo.slice(-3), 10);
    const quizScore = 50 + ((admissionNum * 7) % 45);
    let quizGrade = await Grade.findOne(
      {
        tenantId,
        studentId: student._id,
        subjectId: mathSubject._id,
        termId: term._id,
        assessmentType: 'quiz',
      },
      null,
      { _bypassTenantScope: true }
    ).lean();
    if (!quizGrade) {
      quizGrade = await Grade.create({
        tenantId,
        studentId: student._id,
        sectionId: student.sectionId,
        subjectId: mathSubject._id,
        termId: term._id,
        academicYearId: year._id,
        assessmentType: 'quiz',
        score: quizScore,
        letterGrade: scoreToLetter(quizScore),
        weightage: 0.3,
        gradedBy: users.teacher._id,
      });
      quizGrade = quizGrade.toObject();
    }
    grades.push(quizGrade);
  }

  // ── Report Card Batches ───────────────────────────────────────────────────
  // Created directly (no queue/worker/Minio involved) so the history-list e2e
  // spec has rows to assert against without needing a real PDF generation run.
  const reportCardBatchDefs = [
    {
      jobId: 'seed-report-card-completed-1',
      status: 'completed',
      s3Key: `report-cards/${tenantId}/${term._id}/${section._id}/seed-fixture.pdf`,
    },
    { jobId: 'seed-report-card-queued-1', status: 'queued' },
  ];
  const reportCardBatches = [];
  for (const def of reportCardBatchDefs) {
    let batch = await ReportCardBatch.findOne({ tenantId, jobId: def.jobId }, null, {
      _bypassTenantScope: true,
    }).lean();
    if (!batch) {
      batch = await ReportCardBatch.create({
        tenantId,
        sectionId: section._id,
        termId: term._id,
        requestedBy: users.tenant_admin._id,
        ...def,
      });
      batch = batch.toObject();
    }
    reportCardBatches.push(batch);
  }

  // ── Staff Members (linked to tenant users) ───────────────────────────────
  const staffData = [
    {
      employeeId: 'EMP-TEST-001',
      userId: users.teacher._id,
      firstName: 'Alice',
      lastName: 'Smith',
      designation: 'Teacher',
      department: 'Academics',
    },
    {
      employeeId: 'EMP-TEST-002',
      userId: users.viewer._id,
      firstName: 'Bob',
      lastName: 'Jones',
      designation: 'Accountant',
      department: 'Finance',
    },
  ];
  const staffMembers = [];
  for (const data of staffData) {
    let staff = await StaffMember.findOne({ tenantId, employeeId: data.employeeId }, null, {
      _bypassTenantScope: true,
    }).lean();
    if (!staff) {
      staff = await StaffMember.create({
        tenantId,
        ...data,
        employmentStatus: 'active',
        joiningDate: new Date('2020-06-01'),
      });
      staff = staff.toObject();
    }
    staffMembers.push(staff);
  }

  // Staff member with an uploaded document — exercises the document
  // download route without needing a real S3/Minio upload at seed time.
  let staffWithDocs = await StaffMember.findOne({ tenantId, employeeId: 'EMP-TEST-003' }, null, {
    _bypassTenantScope: true,
  }).lean();
  if (!staffWithDocs) {
    staffWithDocs = await StaffMember.create({
      tenantId,
      userId: new mongoose.Types.ObjectId(),
      employeeId: 'EMP-TEST-003',
      firstName: 'Carla',
      lastName: 'Diaz',
      designation: 'Librarian',
      department: 'Library',
      employmentStatus: 'active',
      joiningDate: new Date('2021-03-01'),
      documents: [
        {
          name: 'ID Proof.pdf',
          key: 'staff/seed/id-proof.pdf',
          uploadedAt: new Date('2021-03-02'),
        },
      ],
    });
    staffWithDocs = staffWithDocs.toObject();
  }

  // Staff member already on leave — exercises the status-transition UI/guard.
  let staffOnLeave = await StaffMember.findOne({ tenantId, employeeId: 'EMP-TEST-004' }, null, {
    _bypassTenantScope: true,
  }).lean();
  if (!staffOnLeave) {
    staffOnLeave = await StaffMember.create({
      tenantId,
      userId: new mongoose.Types.ObjectId(),
      employeeId: 'EMP-TEST-004',
      firstName: 'Dev',
      lastName: 'Kumar',
      designation: 'Lab Assistant',
      department: 'Academics',
      employmentStatus: 'on_leave',
      joiningDate: new Date('2022-01-10'),
    });
    staffOnLeave = staffOnLeave.toObject();
  }

  // A page-and-a-half of lightweight staff so pagination controls have
  // something to page through.
  const bulkStaffMembers = [];
  for (let i = 1; i <= 25; i++) {
    const employeeId = `EMP-BULK-${String(i).padStart(4, '0')}`;
    let bulkStaff = await StaffMember.findOne({ tenantId, employeeId }, null, {
      _bypassTenantScope: true,
    }).lean();
    if (!bulkStaff) {
      bulkStaff = await StaffMember.create({
        tenantId,
        userId: new mongoose.Types.ObjectId(),
        employeeId,
        firstName: `Bulk${i}`,
        lastName: 'Staff',
        designation: 'Support Staff',
        department: 'Operations',
        employmentStatus: 'active',
        joiningDate: new Date('2023-01-01'),
      });
      bulkStaff = bulkStaff.toObject();
    }
    bulkStaffMembers.push(bulkStaff);
  }

  // ── Leave Type ────────────────────────────────────────────────────────────
  let leaveType = await LeaveType.findOne({ tenantId, name: 'Annual Leave' }, null, {
    _bypassTenantScope: true,
  }).lean();
  if (!leaveType) {
    leaveType = await LeaveType.create({
      tenantId,
      name: 'Annual Leave',
      maxDaysPerYear: 20,
      isPaid: true,
    });
    leaveType = leaveType.toObject();
  }

  // ── Salary Structure ──────────────────────────────────────────────────────
  let salaryStructure = await SalaryStructure.findOne({ tenantId, name: 'Basic Structure' }, null, {
    _bypassTenantScope: true,
  }).lean();
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
  let costCenter = await CostCenter.findOne({ tenantId, name: 'General' }, null, {
    _bypassTenantScope: true,
  }).lean();
  if (!costCenter) {
    costCenter = await CostCenter.create({ tenantId, name: 'General', code: 'GEN' });
    costCenter = costCenter.toObject();
  }

  // ── Fee Structure ─────────────────────────────────────────────────────────
  let feeStructure = await FeeStructure.findOne({ tenantId, name: 'Standard Fee' }, null, {
    _bypassTenantScope: true,
  }).lean();
  if (!feeStructure) {
    feeStructure = await FeeStructure.create({
      tenantId,
      name: 'Standard Fee',
      academicYearId: year._id,
      components: [
        { label: 'Tuition', amount: 5000 },
        { label: 'Activity', amount: 500 },
      ],
    });
    feeStructure = feeStructure.toObject();
  }

  // ── Timetable ─────────────────────────────────────────────────────────────
  const mathSub = subjects.find((s) => s.code === 'MATH5');
  const englishSub = subjects.find((s) => s.code === 'ENG5');
  const scienceSub = subjects.find((s) => s.code === 'SCI5');
  const teacherUserId = staffMembers[0].userId; // Alice Smith
  const secondTeacherUserId = staffMembers[1].userId; // Bob Jones

  const timetableDefs = [
    {
      sectionId: section._id,
      subjectId: mathSub._id,
      teacherId: teacherUserId,
      dayOfWeek: 1,
      periodNumber: 1,
      startTime: '09:00',
      endTime: '09:45',
      room: 'Room 101',
    },
    {
      sectionId: section._id,
      subjectId: englishSub._id,
      teacherId: teacherUserId,
      dayOfWeek: 1,
      periodNumber: 2,
      startTime: '09:45',
      endTime: '10:30',
    },
    {
      sectionId: section._id,
      subjectId: scienceSub._id,
      teacherId: teacherUserId,
      dayOfWeek: 2,
      periodNumber: 1,
      startTime: '09:00',
      endTime: '09:45',
    },
    // Section B stays unpublished (draft) — distinct day/period from section
    // A's slots above so the same teacher isn't double-booked at seed time.
    {
      sectionId: sectionB._id,
      subjectId: mathSub._id,
      teacherId: secondTeacherUserId,
      dayOfWeek: 1,
      periodNumber: 3,
      startTime: '10:30',
      endTime: '11:15',
    },
  ];

  const timetable = [];
  for (const def of timetableDefs) {
    let entry = await Timetable.findOne(
      {
        tenantId,
        academicYearId: year._id,
        sectionId: def.sectionId,
        dayOfWeek: def.dayOfWeek,
        periodNumber: def.periodNumber,
      },
      null,
      { _bypassTenantScope: true }
    ).lean();
    if (!entry) {
      entry = await Timetable.create({ tenantId, academicYearId: year._id, ...def });
      entry = entry.toObject();
    }
    timetable.push(entry);
  }

  let timetablePublish = await TimetablePublish.findOne(
    { tenantId, academicYearId: year._id, sectionId: section._id },
    null,
    { _bypassTenantScope: true }
  ).lean();
  if (!timetablePublish) {
    timetablePublish = await TimetablePublish.create({
      tenantId,
      academicYearId: year._id,
      sectionId: section._id,
      publishedBy: users.tenant_admin._id,
    });
    timetablePublish = timetablePublish.toObject();
  }

  // ── Attendance (last 5 days, active students only) ───────────────────────
  const attendanceDates = Array.from({ length: 5 }, (_, i) => {
    const d = new Date('2025-06-02');
    d.setDate(d.getDate() + i);
    return d;
  });
  for (const date of attendanceDates) {
    for (const student of activeStudents) {
      const status =
        student.admissionNo.endsWith('001') && date.getDate() % 5 === 0 ? 'absent' : 'present';
      await AttendanceRecord.findOneAndUpdate(
        { tenantId, date, entityType: 'student', entityId: student._id, subjectId: null },
        {
          $setOnInsert: {
            tenantId,
            date,
            entityType: 'student',
            entityId: student._id,
            sectionId: section._id,
            subjectId: null,
            status,
            markedBy: users.teacher._id,
          },
        },
        { upsert: true, _bypassTenantScope: true }
      );
    }
  }

  // Second student gets a lower attendance rate (3 of 5 days absent) so the
  // attendance report page has a real defaulter to show, without touching
  // student 1's numbers that student-detail.spec.js already asserts against.
  const lowAttendanceStudent = activeStudents[1];
  for (const date of attendanceDates.slice(0, 3)) {
    await AttendanceRecord.findOneAndUpdate(
      {
        tenantId,
        date,
        entityType: 'student',
        entityId: lowAttendanceStudent._id,
        subjectId: null,
      },
      { $set: { status: 'absent' } },
      { _bypassTenantScope: true }
    );
  }

  // Per-period attendance: same day, two subjects, distinct outcomes — proves
  // multiple period-records coexist for one student/date under the new
  // (date, entity, subjectId) unique index.
  const lastAttendanceDate = attendanceDates[attendanceDates.length - 1];
  const periodAttendanceDefs = [
    { student: activeStudents[0], subject: subjects[0], status: 'present' },
    { student: activeStudents[0], subject: subjects[1], status: 'absent' },
    { student: activeStudents[1], subject: subjects[0], status: 'present' },
    { student: activeStudents[1], subject: subjects[1], status: 'late' },
  ];
  for (const def of periodAttendanceDefs) {
    await AttendanceRecord.findOneAndUpdate(
      {
        tenantId,
        date: lastAttendanceDate,
        entityType: 'student',
        entityId: def.student._id,
        subjectId: def.subject._id,
      },
      {
        $setOnInsert: {
          tenantId,
          date: lastAttendanceDate,
          entityType: 'student',
          entityId: def.student._id,
          sectionId: section._id,
          subjectId: def.subject._id,
          status: def.status,
          markedBy: users.teacher._id,
        },
      },
      { upsert: true, _bypassTenantScope: true }
    );
  }

  // ── Fee Assignments + one partial payment ────────────────────────────────
  const feeTotalAmount = feeStructure.components.reduce((sum, c) => sum + c.amount, 0);
  const feeAssignments = [];
  for (const student of activeStudents) {
    let assignment = await FeeAssignment.findOne(
      { tenantId, studentId: student._id, feeStructureId: feeStructure._id },
      null,
      { _bypassTenantScope: true }
    ).lean();
    if (!assignment) {
      assignment = await FeeAssignment.create({
        tenantId,
        studentId: student._id,
        feeStructureId: feeStructure._id,
        academicYearId: year._id,
        totalAmount: feeTotalAmount,
        dueDate: new Date('2025-09-30'),
      });
      assignment = assignment.toObject();
    }
    feeAssignments.push(assignment);
  }

  const firstAssignment = feeAssignments[0];
  if (firstAssignment) {
    const existingPayment = await FeePayment.findOne(
      { tenantId, assignmentId: firstAssignment._id },
      null,
      { _bypassTenantScope: true }
    ).lean();
    if (!existingPayment) {
      const partialAmount = Math.round(feeTotalAmount / 2);
      await FeePayment.create({
        tenantId,
        assignmentId: firstAssignment._id,
        studentId: firstAssignment.studentId,
        amount: partialAmount,
        paymentMethod: 'cash',
        receiptNumber: 'RCP-TEST-00001',
        collectedBy: users.tenant_admin._id,
      });
      await FeeAssignment.updateOne(
        { _id: firstAssignment._id, tenantId },
        { $set: { status: 'partial' } },
        { _bypassTenantScope: true }
      );
    }
  }

  // ── Inventory Items ───────────────────────────────────────────────────────
  const inventoryItems = [];

  const consumableData = [
    {
      sku: 'INV-TEST-001',
      name: 'Whiteboard Marker',
      category: 'stationery',
      quantity: 100,
      reorderLevel: 20,
      unitCost: 10,
    },
    {
      sku: 'INV-TEST-003',
      name: 'Notebook A4',
      category: 'stationery',
      quantity: 500,
      reorderLevel: 50,
      unitCost: 30,
    },
  ];
  for (const data of consumableData) {
    let item = await Consumable.findOne({ tenantId, sku: data.sku }, null, {
      _bypassTenantScope: true,
    }).lean();
    if (!item) {
      item = await Consumable.create({ tenantId, ...data });
      item = item.toObject();
    }
    inventoryItems.push(item);
  }

  let projector = await FixedAsset.findOne({ tenantId, sku: 'INV-TEST-002' }, null, {
    _bypassTenantScope: true,
  }).lean();
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
    users: Object.fromEntries(
      Object.entries(users).map(([k, u]) => [k, { _id: u._id.toString(), email: u.email }])
    ),
    tenant: { _id: tenantId.toString(), subdomain: 'testschool' },
    roles: Object.fromEntries(Object.entries(roleByKey).map(([k, r]) => [k, r._id.toString()])),
    academicYear: { _id: year._id.toString() },
    nextAcademicYear: { _id: nextYear._id.toString(), name: nextYear.name },
    term: { _id: term._id.toString() },
    class: { _id: cls._id.toString() },
    section: { _id: section._id.toString() },
    sectionB: { _id: sectionB._id.toString() },
    subjects: subjects.map((s) => ({ _id: s._id.toString(), name: s.name })),
    students: students.map((s) => ({
      _id: s._id.toString(),
      admissionNo: s.admissionNo,
      status: s.status,
    })),
    feeAssignments: feeAssignments.map((a) => ({
      _id: a._id.toString(),
      studentId: a.studentId.toString(),
      totalAmount: a.totalAmount,
    })),
    reportCardBatches: reportCardBatches.map((b) => ({
      _id: b._id.toString(),
      jobId: b.jobId,
      status: b.status,
      sectionId: b.sectionId.toString(),
      termId: b.termId.toString(),
    })),
    grades: grades.map((g) => ({
      _id: g._id.toString(),
      studentId: g.studentId.toString(),
      subjectId: g.subjectId.toString(),
      sectionId: g.sectionId.toString(),
      assessmentType: g.assessmentType,
      score: g.score,
    })),
    staffMembers: staffMembers.map((s) => ({
      _id: s._id.toString(),
      employeeId: s.employeeId,
      userId: s.userId.toString(),
    })),
    staffWithDocs: { _id: staffWithDocs._id.toString(), employeeId: staffWithDocs.employeeId },
    staffOnLeave: { _id: staffOnLeave._id.toString(), employeeId: staffOnLeave.employeeId },
    bulkStaffCount: bulkStaffMembers.length,
    timetable: timetable.map((t) => ({
      _id: t._id.toString(),
      sectionId: t.sectionId.toString(),
      teacherId: t.teacherId.toString(),
      subjectId: t.subjectId.toString(),
      dayOfWeek: t.dayOfWeek,
      periodNumber: t.periodNumber,
      room: t.room ?? null,
    })),
    timetablePublish: {
      _id: timetablePublish._id.toString(),
      sectionId: timetablePublish.sectionId.toString(),
    },
    leaveType: { _id: leaveType._id.toString() },
    salaryStructure: { _id: salaryStructure._id.toString() },
    costCenter: { _id: costCenter._id.toString() },
    feeStructure: { _id: feeStructure._id.toString() },
    inventoryItems: inventoryItems.map((i) => ({ _id: i._id.toString(), sku: i.sku })),
  };

  // Write to disk so Playwright fixtures can read seeded IDs
  const { writeFileSync, mkdirSync, existsSync } = await import('fs');
  const { resolve, dirname } = await import('path');
  const outPath =
    process.env.SEED_OUTPUT_PATH ||
    resolve(import.meta.dirname, '../../../web/tests/seed/.test-ids.json');
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
