/**
 * seed-uat-college.js — one demo `college` tenant with a populated training
 * programme (batches, modules, trainers, a TPO, students, assignments, projects,
 * placements) so the Career Catalyst portal has something to show on staging.
 *
 * Unlike seed-test-data.js this never uses a fixed password: each account it
 * creates gets a random one, printed once at the end. It refuses to run against
 * any database whose name does not end in `_uat`.
 *
 * Usage (inside the api container, so MONGODB_URI is the container's own):
 *   docker exec -w /app rooted-uat-api-1 node src/scripts/seed-uat-college.js
 *
 * Idempotent: every row is looked up by its natural key first, so a re-run adds
 * nothing and prints "(unchanged)" instead of a password for existing accounts.
 */

import '../config/env.js';
import crypto from 'node:crypto';
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
import { GradeLock } from '../models/GradeLock.js';
import { Assignment } from '../models/Assignment.js';
import { Submission } from '../models/Submission.js';
import { Project } from '../models/Project.js';
import { Employer } from '../models/Employer.js';
import { PlacementApplication } from '../models/PlacementApplication.js';
import { Enrollment } from '../models/Enrollment.js';
import { scoreToLetter } from '@rooted/shared/utils';
import { hashPassword } from '../services/auth.service.js';

const TENANT_NAME = 'Demo Engineering College (UAT)';
const SUBDOMAIN = 'demo-college';
const EMAIL_DOMAIN = 'demo-college.example';
const BYPASS = { _bypassTenantScope: true };

const STAFF = [
  { key: 'admin', name: 'uat-college-admin', role: 'tenant_admin' },
  { key: 'tpo', name: 'uat-college-tpo', role: 'principal' },
  { key: 'trainer1', name: 'uat-trainer-meera', role: 'teacher' },
  { key: 'trainer2', name: 'uat-trainer-arjun', role: 'teacher' },
];

const STUDENT_NAMES = [
  ['Aarav', 'Sharma'],
  ['Diya', 'Patel'],
  ['Vihaan', 'Reddy'],
  ['Ananya', 'Iyer'],
  ['Rohan', 'Verma'],
  ['Ishita', 'Nair'],
  ['Kabir', 'Singh'],
  ['Meera', 'Joshi'],
  ['Arnav', 'Gupta'],
  ['Saanvi', 'Menon'],
  ['Aditya', 'Rao'],
  ['Kavya', 'Desai'],
  ['Dev', 'Kulkarni'],
  ['Riya', 'Bose'],
  ['Yash', 'Malhotra'],
  ['Tara', 'Pillai'],
  ['Neil', 'Chopra'],
  ['Pooja', 'Bhatt'],
  ['Harsh', 'Agarwal'],
  ['Naina', 'Kapoor'],
  ['Om', 'Trivedi'],
  ['Zara', 'Khan'],
  ['Ritvik', 'Das'],
  ['Sneha', 'Mishra'],
];

const MODULES = [
  { name: 'Git and Linux Basics', code: 'GIT101' },
  { name: 'Web Fundamentals', code: 'WEB102' },
  { name: 'Backend APIs', code: 'API103' },
  { name: 'Cloud Deployment', code: 'CLD104' },
  { name: 'Interview Preparation', code: 'INT105' },
];

const EMPLOYERS = ['Infosys Springboard', 'Wipro Digital', 'Zoho Corporation', 'Freshworks'];

const daysAgo = (n) => new Date(Date.now() - n * 86400000);
const clamp = (n) => Math.max(0, Math.min(100, n));

async function ensure(Model, filter, data) {
  return Model.findOneAndUpdate(
    filter,
    { $setOnInsert: { ...filter, ...data } },
    { upsert: true, new: true, setDefaultsOnInsert: true, ...BYPASS }
  ).lean();
}

async function run() {
  await mongoose.connect(env.MONGODB_URI);
  const dbName = mongoose.connection.name;
  if (!dbName.endsWith('_uat')) {
    console.error(`Refusing to seed database "${dbName}": name must end in _uat.`);
    process.exit(1);
  }

  const issued = [];
  async function ensureUser(username, extra = {}) {
    const email = `${username}@${EMAIL_DOMAIN}`;
    const existing = await User.findOne({ email }, null, BYPASS).lean();
    if (existing) {
      issued.push({ email, password: '(unchanged)' });
      return existing;
    }
    const password = crypto.randomBytes(9).toString('base64url');
    const user = await User.create({
      email,
      username,
      usernameLower: username,
      passwordHash: await hashPassword(password),
      status: 'active',
      emailVerified: true,
      ...extra,
    });
    issued.push({ email, password });
    return user.toObject();
  }

  // ── Tenant (college orgType enables the training module by default) ───────
  let tenant = await Tenant.findOne({ subdomain: SUBDOMAIN }).lean();
  if (!tenant) {
    tenant = (
      await Tenant.create({
        name: TENANT_NAME,
        subdomain: SUBDOMAIN,
        orgType: 'college',
        plan: 'pro',
        status: 'active',
      })
    ).toObject();
  }
  const tenantId = tenant._id;

  // ── Roles and staff ───────────────────────────────────────────────────────
  let roles = await Role.find({ tenantId }, null, BYPASS).lean();
  if (roles.length === 0) {
    roles = await Role.insertMany(
      Object.entries(DEFAULT_ROLE_TEMPLATES).map(([key, permissions]) => ({
        tenantId,
        name: key.replace('_', ' '),
        permissions,
        isTemplate: true,
        templateKey: key,
      }))
    );
  }
  const roleByKey = Object.fromEntries(roles.map((r) => [r.templateKey, r]));

  async function addMembership(user, roleKey) {
    await TenantMembership.findOneAndUpdate(
      { tenantId, userId: user._id },
      {
        $setOnInsert: { tenantId, userId: user._id, roleIds: [roleByKey[roleKey]._id] },
        // The schema default is 'invited', which login does not list as a tenant.
        $set: { status: 'active' },
      },
      { upsert: true, setDefaultsOnInsert: true, ...BYPASS }
    );
  }

  const staff = {};
  for (const s of STAFF) {
    staff[s.key] = await ensureUser(s.name);
    await addMembership(staff[s.key], s.role);
  }

  // ── Programme structure: year > cohort (Term) > programme (Class) > batches ─
  const year = await ensure(
    AcademicYear,
    { tenantId, name: '2026-27' },
    { startDate: new Date('2026-04-01'), endDate: new Date('2027-03-31'), isActive: true }
  );
  const term = await ensure(
    Term,
    { tenantId, name: 'Cohort Jul-2026' },
    {
      academicYearId: year._id,
      startDate: new Date('2026-07-01'),
      endDate: new Date('2026-12-20'),
    }
  );
  const cls = await ensure(Class, { tenantId, name: 'Full-Stack Programme' }, { gradeLevel: 1 });
  const batches = [];
  for (const name of ['Batch A', 'Batch B']) {
    batches.push(await ensure(Section, { tenantId, classId: cls._id, name }, {}));
  }
  const modules = [];
  for (const m of MODULES) {
    modules.push(
      await ensure(
        Subject,
        { tenantId, classId: cls._id, code: m.code },
        { name: m.name, creditHours: 4 }
      )
    );
  }

  // ── Students: 12 per batch; the first of each batch has a self-service login ─
  const students = [];
  for (const [i, [firstName, lastName]] of STUDENT_NAMES.entries()) {
    const batchIdx = i < 12 ? 0 : 1;
    const student = await ensure(
      Student,
      { tenantId, admissionNo: `UAT-COL-${String(i + 1).padStart(3, '0')}` },
      {
        firstName,
        lastName,
        sectionId: batches[batchIdx]._id,
        gender: i % 2 === 0 ? 'male' : 'female',
        status: 'active',
      }
    );
    students.push({ ...student, batchIdx, idxInBatch: i % 12 });
  }
  for (const s of students.filter((x) => x.idxInBatch === 0)) {
    const login = await ensureUser(`uat-student-${s.firstName.toLowerCase()}`);
    await addMembership(login, 'student');
    await Student.updateOne({ _id: s._id, tenantId }, { $set: { userId: login._id } }, BYPASS);
  }

  // ── Grades: baseline < final in the first two modules, mock interviews for some ─
  async function grade(s, subject, assessmentType, score) {
    await ensure(
      Grade,
      { tenantId, studentId: s._id, subjectId: subject._id, termId: term._id, assessmentType },
      {
        sectionId: s.sectionId,
        academicYearId: year._id,
        score,
        letterGrade: scoreToLetter(score),
        weightage: 0,
        gradedBy: staff.trainer1._id,
      }
    );
  }
  for (const [i, s] of students.entries()) {
    for (const [mi, subject] of modules.slice(0, 2).entries()) {
      const baseline = clamp(28 + ((i * 7 + mi * 11) % 30));
      await grade(s, subject, 'baseline', baseline);
      await grade(s, subject, 'final', clamp(baseline + 18 + ((i * 5) % 20)));
    }
    if (i % 3 !== 2) await grade(s, modules[4], 'mock_interview', clamp(55 + ((i * 9) % 40)));
  }
  // Publish the first module's finals so the student logins see a result.
  for (const batch of batches) {
    await ensure(
      GradeLock,
      {
        tenantId,
        sectionId: batch._id,
        subjectId: modules[0]._id,
        termId: term._id,
        assessmentType: 'final',
      },
      { publishedBy: staff.admin._id }
    );
  }

  // ── Assignments and submissions: mixed reviewed / submitted / missing ──────
  const defs = [
    { title: 'Git branching workflow', mod: 0, due: 90, max: 10 },
    { title: 'Build a static portfolio page', mod: 1, due: 70, max: 20 },
    { title: 'REST API with auth', mod: 2, due: 45, max: 20 },
    { title: 'Deploy to a cloud VM', mod: 3, due: 20, max: 10 },
  ];
  for (const [bi, batch] of batches.entries()) {
    for (const [di, def] of defs.entries()) {
      const assignment = await ensure(
        Assignment,
        { tenantId, sectionId: batch._id, title: def.title },
        {
          subjectId: modules[def.mod]._id,
          termId: term._id,
          dueDate: daysAgo(def.due),
          maxScore: def.max,
          createdBy: staff[bi === 0 ? 'trainer1' : 'trainer2']._id,
        }
      );
      for (const s of students.filter((x) => x.batchIdx === bi)) {
        const roll = (s.idxInBatch + di) % 5;
        if (roll === 0) continue; // never submitted
        const reviewed = roll >= 2;
        await ensure(
          Submission,
          { tenantId, assignmentId: assignment._id, studentId: s._id },
          {
            status: reviewed ? 'reviewed' : 'submitted',
            score: reviewed ? Math.round(def.max * (0.5 + roll * 0.1)) : null,
            submittedAt: daysAgo(def.due - 1),
            reviewedAt: reviewed ? daysAgo(def.due - 3) : null,
            reviewedBy: reviewed ? staff.trainer1._id : null,
          }
        );
      }
    }
  }

  // ── Team projects (Batch A) ───────────────────────────────────────────────
  const teamsOf = (n) => students.filter((s) => s.batchIdx === 0).slice(n * 4, n * 4 + 4);
  for (const [t, name] of ['Team Alpha', 'Team Beta', 'Team Gamma'].entries()) {
    await ensure(
      Project,
      { tenantId, sectionId: batches[0]._id, name: `${name} capstone` },
      {
        termId: term._id,
        repoUrl: `https://github.com/demo-college-uat/${name.toLowerCase().replace(' ', '-')}`,
        memberIds: teamsOf(t).map((s) => s._id),
        milestones: [
          { title: 'Auth done', dueDate: daysAgo(40), doneAt: daysAgo(42) },
          { title: 'Deployed', dueDate: daysAgo(10), ...(t < 2 ? { doneAt: daysAgo(12) } : {}) },
        ],
        demoDate: daysAgo(-14),
        ...(t === 0
          ? {
              reviewScore: 84,
              reviewNotes: 'Clean architecture, strong demo.',
              reviewedBy: staff.trainer1._id,
            }
          : {}),
        createdBy: staff.trainer1._id,
      }
    );
  }

  // ── Completion decisions (admin's call, never computed) ───────────────────
  const enrollment = {
    A: [
      [0, 'completed'],
      [1, 'completed'],
      [11, 'dropped'],
    ],
    B: [[0, 'completed']],
  };
  for (const [letter, plan] of Object.entries(enrollment)) {
    const bi = letter === 'A' ? 0 : 1;
    for (const [idx, status] of plan) {
      const s = students.find((x) => x.batchIdx === bi && x.idxInBatch === idx);
      await ensure(
        Enrollment,
        { tenantId, studentId: s._id, sectionId: batches[bi]._id },
        {
          status,
          startDate: new Date('2026-07-01'),
          endDate: daysAgo(5),
          enrolledBy: staff.admin._id,
        }
      );
    }
  }

  // ── Employers and a spread of placement stages (Batch A) ──────────────────
  const employers = [];
  for (const name of EMPLOYERS)
    employers.push(await ensure(Employer, { tenantId, name }, { active: true }));
  const stages = [
    [
      'joined',
      {
        appliedAt: daysAgo(60),
        interviewedAt: daysAgo(50),
        offeredAt: daysAgo(40),
        joinedAt: daysAgo(20),
      },
    ],
    ['offered', { appliedAt: daysAgo(55), interviewedAt: daysAgo(45), offeredAt: daysAgo(30) }],
    ['interviewed', { appliedAt: daysAgo(40), interviewedAt: daysAgo(25) }],
    ['interviewed', { appliedAt: daysAgo(38), interviewedAt: daysAgo(22) }],
    ['applied', { appliedAt: daysAgo(15) }],
    ['applied', { appliedAt: daysAgo(12) }],
    ['rejected', { appliedAt: daysAgo(35), closedAt: daysAgo(18) }],
  ];
  const batchA = students.filter((s) => s.batchIdx === 0);
  for (const [i, [stage, dates]] of stages.entries()) {
    await ensure(
      PlacementApplication,
      {
        tenantId,
        studentId: batchA[i]._id,
        employerId: employers[i % employers.length]._id,
        role: 'Junior Developer',
      },
      { stage, ...dates, createdBy: staff.trainer1._id }
    );
  }
  for (const s of batchA.slice(0, 3)) {
    await Student.updateOne(
      { _id: s._id, tenantId },
      {
        $set: {
          placementConsent: { granted: true, at: daysAgo(30), recordedBy: staff.trainer1._id },
        },
      },
      BYPASS
    );
  }

  console.log(`\nSeeded "${TENANT_NAME}" (${tenantId}) in ${dbName}\n`);
  console.log('Account passwords (shown once; re-runs print "(unchanged)"):');
  for (const { email, password } of issued) console.log(`  ${email.padEnd(46)} ${password}`);
  await mongoose.disconnect();
  // auth.service.js pulls in the Redis client, which would keep Node alive.
  process.exit(0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
