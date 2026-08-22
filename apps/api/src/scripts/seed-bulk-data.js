/**
 * seed-bulk-data.js — full-scale realistic demo data for one tenant.
 *
 * Seeds a complete Indian K-10 school: real student/staff names, a 40-section
 * academic structure, a conflict-free timetable, a month of attendance, three
 * assessment rounds of grades, fee assignments/payments, payroll, leave,
 * expenses and inventory.
 *
 * Usage (dev DB, from repo root):
 *   node --env-file=apps/api/.env apps/api/src/scripts/seed-bulk-data.js --reset
 *
 * Options:
 *   --students=N         how many students to seed (default 1000)
 *   --tenant=<sub>       target tenant subdomain (default testschool)
 *   --attendance-days=N  school days of attendance to generate (default 20)
 *   --today=YYYY-MM-DD   anchor date for "current" data (default: real today)
 *   --reset              purge this tenant's data first (keeps tenant, roles and
 *                        the canonical login users) — recommended for a clean run
 *
 * Without --reset the script is idempotent: every write is an upsert keyed on the
 * model's unique index, so re-running only fills gaps.
 *
 * Data volume at the default 1000 students: ~1000 students, 74 staff, 1600
 * timetable slots, ~20k attendance records, ~32k grades, ~2.5k fee rows.
 */

import '../config/env.js';
import mongoose from 'mongoose';
import { scoreToLetter } from '@rooted/shared/utils';
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
import { Timetable } from '../models/Timetable.js';
import { TimetablePublish } from '../models/TimetablePublish.js';
import { AttendanceRecord } from '../models/AttendanceRecord.js';
import { Grade } from '../models/Grade.js';
import { GradeLock } from '../models/GradeLock.js';
import { ReportCardBatch } from '../models/ReportCardBatch.js';
import { StaffMember } from '../models/StaffMember.js';
import { LeaveType } from '../models/LeaveType.js';
import { LeaveBalance } from '../models/LeaveBalance.js';
import { LeaveRequest } from '../models/LeaveRequest.js';
import { SalaryStructure } from '../models/SalaryStructure.js';
import { SalarySlip } from '../models/SalarySlip.js';
import { CostCenter } from '../models/CostCenter.js';
import { Budget } from '../models/Budget.js';
import { ExpenseEntry } from '../models/ExpenseEntry.js';
import { FeeStructure } from '../models/FeeStructure.js';
import { FeeAssignment } from '../models/FeeAssignment.js';
import { FeePayment } from '../models/FeePayment.js';
import { FeeDiscount } from '../models/FeeDiscount.js';
import { InventoryItem, Consumable, FixedAsset } from '../models/InventoryItem.js';
import { StockMovement } from '../models/StockMovement.js';
import { PurchaseRequisition } from '../models/PurchaseRequisition.js';
import { Notification } from '../models/Notification.js';
import { hashPassword } from '../services/auth.service.js';
import { encryptField } from '../utils/fieldEncryption.js';

// ── CLI ──────────────────────────────────────────────────────────────────────
const ARGV = process.argv.slice(2);
function flag(name, fallback) {
  const hit = ARGV.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}
const RESET = ARGV.includes('--reset');
const TARGET_STUDENTS = Number(flag('students', '1000'));
const SUBDOMAIN = flag('tenant', 'testschool');
const ATTENDANCE_DAYS = Number(flag('attendance-days', '20'));
const TODAY = new Date(`${flag('today', new Date().toISOString().slice(0, 10))}T00:00:00.000Z`);

const BYPASS = { _bypassTenantScope: true };
const PASS = 'TestPass123!';
const EMAIL_DOMAIN = `${SUBDOMAIN}.local`;
// Login users seeded by seed-test-data.js — never deleted, reused as demo logins.
const CANONICAL_EMAILS = [
  'admin@test.local',
  `tadmin@${EMAIL_DOMAIN}`,
  `teacher@${EMAIL_DOMAIN}`,
  `viewer@${EMAIL_DOMAIN}`,
  `principal@${EMAIL_DOMAIN}`,
];

const log = (...args) => console.error(...args);

// ── Deterministic randomness ─────────────────────────────────────────────────
// Seeded PRNG so two runs produce byte-identical data — upserts then stay
// idempotent and screenshots/mockups keep matching the DB.
function mulberry32(seed) {
  let a = seed;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20260822);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const randInt = (min, max) => min + Math.floor(rand() * (max - min + 1));
const chance = (pct) => rand() * 100 < pct;

// ── Name pools (Indian names across regions) ─────────────────────────────────
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
  'Advait',
  'Atharv',
  'Rudra',
  'Kian',
  'Neel',
  'Veer',
  'Samarth',
  'Ayaan',
  'Rishi',
  'Tanay',
  'Naveen',
  'Suhas',
  'Girish',
  'Mahesh',
  'Ganesh',
  'Vikram',
  'Sandeep',
  'Prakash',
  'Ramesh',
  'Suresh',
  'Anil',
  'Sunil',
  'Deepak',
  'Ajay',
  'Vijay',
  'Rajesh',
  'Mukesh',
  'Nitin',
  'Amit',
  'Sumit',
  'Rohit',
  'Mohit',
  'Ankit',
  'Ashish',
  'Abhishek',
  'Gaurav',
  'Saurabh',
  'Vaibhav',
  'Pankaj',
  'Alok',
  'Bhavesh',
  'Chetan',
  'Darshan',
  'Eshan',
  'Farhan',
  'Gagan',
  'Hemant',
  'Imran',
  'Jatin',
  'Kunal',
  'Lakshay',
  'Madhav',
  'Nakul',
  'Ojas',
  'Parth',
  'Rakesh',
  'Sagar',
  'Tarun',
  'Umesh',
  'Vinay',
  'Yogesh',
  'Zaid',
  'Arnav',
  'Kartik',
  'Aayush',
  'Shivam',
  'Sarthak',
  'Hrithik',
  'Ritesh',
  'Tejas',
  'Nilesh',
  'Bhuvan',
  'Aniket',
  'Bharat',
  'Chirag',
  'Dinesh',
  'Ekansh',
  'Faizan',
  'Govind',
  'Hardik',
  'Ishwar',
  'Jayant',
  'Keshav',
  'Lalit',
  'Manoj',
  'Naman',
  'Pradeep',
  'Rehan',
  'Shashank',
  'Uday',
  'Yuvraj',
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
  'Sanjana',
  'Deepika',
  'Lakshmi',
  'Sita',
  'Gita',
  'Rekha',
  'Sunita',
  'Anjali',
  'Kajal',
  'Payal',
  'Swati',
  'Manisha',
  'Vandana',
  'Shalini',
  'Ritika',
  'Bhavna',
  'Chhavi',
  'Damini',
  'Ekta',
  'Falguni',
  'Garima',
  'Harini',
  'Indira',
  'Jyoti',
  'Kalpana',
  'Latika',
  'Madhuri',
  'Nandini',
  'Oviya',
  'Pallavi',
  'Rachana',
  'Sarika',
  'Tara',
  'Urmila',
  'Vaishnavi',
  'Yamini',
  'Aishwarya',
  'Bhumika',
  'Charu',
  'Dhanvi',
  'Eesha',
  'Gauri',
  'Hansika',
  'Ira',
  'Janhvi',
  'Kritika',
  'Leela',
  'Mahima',
  'Namrata',
  'Ojaswi',
  'Parul',
  'Rhea',
  'Simran',
  'Tanya',
  'Uma',
  'Vidya',
  'Yashika',
  'Ahana',
  'Bela',
  'Chitra',
  'Devika',
  'Esha',
  'Ganga',
  'Heena',
  'Ishani',
  'Juhi',
  'Kamna',
  'Lavanya',
  'Mitali',
  'Nikita',
  'Oorja',
  'Pihu',
  'Ruhi',
  'Sakshi',
  'Tulsi',
  'Varsha',
  'Yukti',
  'Anushka',
  'Bhavya',
  'Charvi',
  'Drishti',
  'Gargi',
  'Inaya',
  'Jiya',
  'Kashvi',
  'Mishka',
  'Nitya',
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
  'Desai',
  'Joshi',
  'Kulkarni',
  'Deshpande',
  'Chatterjee',
  'Banerjee',
  'Mukherjee',
  'Bose',
  'Ghosh',
  'Dutta',
  'Singh',
  'Kaur',
  'Gill',
  'Sandhu',
  'Kapoor',
  'Malhotra',
  'Chopra',
  'Khanna',
  'Bhatia',
  'Ahuja',
  'Mehta',
  'Trivedi',
  'Pandey',
  'Mishra',
  'Tiwari',
  'Dubey',
  'Yadav',
  'Chauhan',
  'Rathore',
  'Shekhawat',
  'Naidu',
  'Krishnan',
  'Subramanian',
  'Raman',
  'Pillai',
  'Kurup',
  'Prabhu',
  'Shetty',
  'Hegde',
  'Gowda',
  'Kamath',
  'Bhat',
  'Acharya',
  'Pai',
  'Sinha',
  'Jha',
  'Thakur',
  'Prasad',
  'Choudhury',
  'Barua',
  'Saikia',
  'Das',
  'Sarkar',
  'Nandy',
  'Dey',
  'Roy',
  'Paul',
  'Biswas',
  'Mondal',
  'Ansari',
  'Khan',
  'Sheikh',
  'Qureshi',
  'Siddiqui',
  'Fernandes',
  "D'Souza",
  'Pereira',
  'Rodrigues',
  'Almeida',
  'Chettiar',
];

/** Unique (first, last, gender) tuples — drawn without repetition. */
function makeNameFactory() {
  const used = new Set();
  return function nextName(genderHint) {
    for (let attempt = 0; attempt < 400; attempt++) {
      const gender = genderHint ?? (chance(51) ? 'male' : 'female');
      const first = pick(gender === 'male' ? MALE_FIRST : FEMALE_FIRST);
      const last = pick(SURNAMES);
      const key = `${first} ${last}`;
      if (used.has(key)) continue;
      used.add(key);
      return { firstName: first, lastName: last, gender };
    }
    // Pool exhausted (>19k combos) — fall back to a numbered variant.
    const gender = genderHint ?? 'other';
    const first = pick(gender === 'male' ? MALE_FIRST : FEMALE_FIRST);
    const last = `${pick(SURNAMES)}-${used.size}`;
    used.add(`${first} ${last}`);
    return { firstName: first, lastName: last, gender };
  };
}

function emailFactory(taken) {
  return function nextEmail(firstName, lastName) {
    const base = `${firstName}.${lastName}`.toLowerCase().replace(/[^a-z.]/g, '');
    let email = `${base}@${EMAIL_DOMAIN}`;
    let n = 2;
    while (taken.has(email)) {
      email = `${base}${n}@${EMAIL_DOMAIN}`;
      n++;
    }
    taken.add(email);
    return email;
  };
}

// ── Date helpers ─────────────────────────────────────────────────────────────
const DAY_MS = 24 * 60 * 60 * 1000;
const utc = (y, m, d) => new Date(Date.UTC(y, m - 1, d));
const addDays = (date, n) => new Date(date.getTime() + n * DAY_MS);
const isWeekend = (date) => date.getUTCDay() === 0 || date.getUTCDay() === 6;

/** The last `count` weekdays up to and including `end`. */
function schoolDays(end, count) {
  const days = [];
  let cursor = new Date(end.getTime());
  while (days.length < count) {
    if (!isWeekend(cursor)) days.unshift(new Date(cursor.getTime()));
    cursor = addDays(cursor, -1);
  }
  return days;
}

/** April–March academic year containing `date`. */
function academicYearStart(date) {
  const y = date.getUTCFullYear();
  return date.getUTCMonth() + 1 >= 4 ? y : y - 1;
}

// ── Bulk write helper ────────────────────────────────────────────────────────
async function flush(Model, ops, label) {
  if (ops.length === 0) return 0;
  const CHUNK = 1000;
  let written = 0;
  let skipped = 0;
  for (let i = 0; i < ops.length; i += CHUNK) {
    const batch = ops.slice(i, i + CHUNK);
    try {
      const res = await Model.bulkWrite(batch, { ordered: false });
      written += (res.upsertedCount ?? 0) + (res.modifiedCount ?? 0) + (res.insertedCount ?? 0);
    } catch (err) {
      // Re-runs without --reset can collide with rows an earlier seed created
      // under a different key (e.g. same SKU, other itemType). Those rows are
      // already there — count them and keep going instead of aborting the seed.
      const dupes = (err.writeErrors ?? []).filter(
        (e) => e.err?.code === 11000 || e.code === 11000
      );
      if (dupes.length === 0 && err.code !== 11000) throw err;
      skipped += dupes.length || 1;
      written += err.result?.nUpserted ?? 0;
      written += err.result?.nModified ?? 0;
    }
  }
  log(
    `  ${label}: ${ops.length} rows (${written} written${skipped ? `, ${skipped} already existed` : ''})`
  );
  return written;
}

/** upsert-one op keyed on `filter`, setting `doc` only. */
const up = (filter, doc) => ({
  updateOne: { filter, update: { $set: doc }, upsert: true },
});

// ── Academic structure constants ─────────────────────────────────────────────
const GRADES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const SECTION_NAMES = ['A', 'B', 'C', 'D'];
const SUBJECT_DEFS = [
  { name: 'Mathematics', prefix: 'MATH', department: 'Mathematics', credits: 6 },
  { name: 'English', prefix: 'ENG', department: 'English', credits: 6 },
  { name: 'Science', prefix: 'SCI', department: 'Science', credits: 6 },
  { name: 'Social Studies', prefix: 'SST', department: 'Social Studies', credits: 5 },
  { name: 'Hindi', prefix: 'HIN', department: 'Languages', credits: 5 },
  { name: 'Computer Science', prefix: 'CS', department: 'Computer Science', credits: 4 },
  { name: 'Physical Education', prefix: 'PE', department: 'Physical Education', credits: 2 },
  { name: 'Art & Craft', prefix: 'ART', department: 'Arts', credits: 2 },
];
const PERIOD_TIMES = [
  ['08:00', '08:45'],
  ['08:45', '09:30'],
  ['09:45', '10:30'],
  ['10:30', '11:15'],
  ['11:15', '12:00'],
  ['12:45', '13:30'],
  ['13:30', '14:15'],
  ['14:15', '15:00'],
];
const WEEKDAYS = [1, 2, 3, 4, 5];
const TEACHERS_PER_SUBJECT = 8; // 8 subjects x 8 = 64 teachers, 40 sections to cover

const SUPPORT_STAFF = [
  { designation: 'Principal', department: 'Administration', role: 'principal', pay: 145000 },
  { designation: 'Vice Principal', department: 'Administration', role: 'principal', pay: 110000 },
  { designation: 'Admin Officer', department: 'Administration', role: 'tenant_admin', pay: 62000 },
  { designation: 'Accountant', department: 'Finance', role: 'accountant', pay: 58000 },
  { designation: 'Accounts Assistant', department: 'Finance', role: 'accountant', pay: 38000 },
  { designation: 'Librarian', department: 'Library', role: 'librarian', pay: 42000 },
  { designation: 'Lab Assistant', department: 'Science', role: 'librarian', pay: 32000 },
  { designation: 'Sports Coach', department: 'Physical Education', role: 'teacher', pay: 46000 },
  { designation: 'Counsellor', department: 'Student Welfare', role: 'teacher', pay: 54000 },
  {
    designation: 'Front Desk Executive',
    department: 'Administration',
    role: 'librarian',
    pay: 28000,
  },
];
// Canonical logins get a real staff identity so the demo accounts have data.
const FIXED_STAFF = {
  [`principal@${EMAIL_DOMAIN}`]: 'Principal',
  [`tadmin@${EMAIL_DOMAIN}`]: 'Admin Officer',
  [`viewer@${EMAIL_DOMAIN}`]: 'Librarian',
};

const RESET_MODELS = [
  ['Attendance', AttendanceRecord],
  ['Grades', Grade],
  ['Grade locks', GradeLock],
  ['Timetable', Timetable],
  ['Timetable publishes', TimetablePublish],
  ['Report card batches', ReportCardBatch],
  ['Students', Student],
  ['Sections', Section],
  ['Subjects', Subject],
  ['Classes', Class],
  ['Terms', Term],
  ['Academic years', AcademicYear],
  ['Fee payments', FeePayment],
  ['Fee assignments', FeeAssignment],
  ['Fee discounts', FeeDiscount],
  ['Fee structures', FeeStructure],
  ['Salary slips', SalarySlip],
  ['Salary structures', SalaryStructure],
  ['Leave requests', LeaveRequest],
  ['Leave balances', LeaveBalance],
  ['Leave types', LeaveType],
  ['Staff members', StaffMember],
  ['Expense entries', ExpenseEntry],
  ['Budgets', Budget],
  ['Cost centers', CostCenter],
  ['Stock movements', StockMovement],
  ['Purchase requisitions', PurchaseRequisition],
  ['Inventory items', InventoryItem],
  ['Notifications', Notification],
];

async function resetTenant(tenantId) {
  log('\n── Reset ─────────────────────────────────────────');
  for (const [label, Model] of RESET_MODELS) {
    const { deletedCount } = await Model.deleteMany({ tenantId }, BYPASS);
    if (deletedCount) log(`  cleared ${label}: ${deletedCount}`);
  }
  // Generated staff logins only — the canonical demo users stay.
  const generated = await User.find(
    { email: { $regex: `@${EMAIL_DOMAIN}$`, $nin: CANONICAL_EMAILS } },
    '_id',
    BYPASS
  ).lean();
  if (generated.length) {
    const ids = generated.map((u) => u._id);
    await TenantMembership.deleteMany({ tenantId, userId: { $in: ids } }, BYPASS);
    await User.deleteMany({ _id: { $in: ids } }, BYPASS);
    log(`  cleared generated users: ${ids.length}`);
  }
}

async function ensureIndexes() {
  // deleteMany doesn't drop indexes, and several unique indexes gained fields
  // after earlier seeds ran — resync before writing so upserts key correctly.
  await Promise.all(
    [AttendanceRecord, Grade, GradeLock, Timetable, TimetablePublish, ReportCardBatch].map((M) =>
      M.syncIndexes()
    )
  );
}

async function run() {
  const started = Date.now();
  await mongoose.connect(env.MONGODB_URI);
  log(`Connected: ${env.MONGODB_URI}`);
  log(
    `Target: ${TARGET_STUDENTS} students in tenant "${SUBDOMAIN}", anchored at ${TODAY.toISOString().slice(0, 10)}`
  );

  // ── Tenant ────────────────────────────────────────────────────────────────
  let tenant = await Tenant.findOne({ subdomain: SUBDOMAIN }).lean();
  if (!tenant) {
    tenant = (
      await Tenant.create({
        name: 'Greenwood Public School',
        subdomain: SUBDOMAIN,
        plan: 'pro',
        status: 'active',
        locale: 'en',
        timezone: 'Asia/Kolkata',
        currency: 'INR',
      })
    ).toObject();
    log(`Created tenant ${SUBDOMAIN}`);
  }
  const tenantId = tenant._id;

  await ensureIndexes();
  if (RESET) await resetTenant(tenantId);

  // ── Roles ─────────────────────────────────────────────────────────────────
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

  // ── Academic years & terms ────────────────────────────────────────────────
  log('\n── Academic structure ────────────────────────────');
  const activeStartYear = academicYearStart(TODAY);
  const yearDefs = [-2, -1, 0].map((offset) => {
    const start = activeStartYear + offset;
    return {
      name: `${start}-${String((start + 1) % 100).padStart(2, '0')}`,
      startDate: utc(start, 4, 1),
      endDate: utc(start + 1, 3, 31),
      isActive: offset === 0,
    };
  });
  await flush(
    AcademicYear,
    yearDefs.map((y) => up({ tenantId, name: y.name }, { tenantId, ...y })),
    'Academic years'
  );
  const years = await AcademicYear.find({ tenantId }, null, BYPASS).sort({ startDate: 1 }).lean();
  const yearByName = Object.fromEntries(years.map((y) => [y.name, y]));
  const activeYear = yearByName[yearDefs[2].name];
  // Exactly one active year, or the UI's "current year" pickers get ambiguous.
  await AcademicYear.updateMany(
    { tenantId, _id: { $ne: activeYear._id } },
    { $set: { isActive: false } },
    BYPASS
  );

  const termOps = [];
  for (const y of years) {
    const startYear = y.startDate.getUTCFullYear();
    termOps.push(
      up(
        { tenantId, academicYearId: y._id, name: 'Term 1' },
        {
          tenantId,
          academicYearId: y._id,
          name: 'Term 1',
          startDate: utc(startYear, 4, 1),
          endDate: utc(startYear, 9, 30),
        }
      ),
      up(
        { tenantId, academicYearId: y._id, name: 'Term 2' },
        {
          tenantId,
          academicYearId: y._id,
          name: 'Term 2',
          startDate: utc(startYear, 10, 1),
          endDate: utc(startYear + 1, 3, 31),
        }
      )
    );
  }
  await flush(Term, termOps, 'Terms');
  const terms = await Term.find({ tenantId, academicYearId: activeYear._id }, null, BYPASS)
    .sort({ startDate: 1 })
    .lean();
  const term1 = terms.find((t) => t.name === 'Term 1');
  const term2 = terms.find((t) => t.name === 'Term 2');

  // ── Classes, sections, subjects ───────────────────────────────────────────
  await flush(
    Class,
    GRADES.map((g) =>
      up({ tenantId, name: `Grade ${g}` }, { tenantId, name: `Grade ${g}`, gradeLevel: g })
    ),
    'Classes'
  );
  const classes = await Class.find({ tenantId }, null, BYPASS).sort({ gradeLevel: 1 }).lean();

  await flush(
    Section,
    classes.flatMap((cls) =>
      SECTION_NAMES.map((name) =>
        up({ tenantId, classId: cls._id, name }, { tenantId, classId: cls._id, name })
      )
    ),
    'Sections'
  );
  const sectionDocs = await Section.find({ tenantId }, null, BYPASS).lean();
  const classById = Object.fromEntries(classes.map((c) => [c._id.toString(), c]));
  const sections = sectionDocs
    .map((s) => ({
      ...s,
      gradeLevel: classById[s.classId.toString()]?.gradeLevel ?? 0,
      label: `${classById[s.classId.toString()]?.name ?? '?'} - ${s.name}`,
      room: `R-${classById[s.classId.toString()]?.gradeLevel ?? 0}${s.name}`,
    }))
    .sort((a, b) => a.gradeLevel - b.gradeLevel || a.name.localeCompare(b.name));

  await flush(
    Subject,
    classes.flatMap((cls) =>
      SUBJECT_DEFS.map((def) =>
        up(
          { tenantId, code: `${def.prefix}${cls.gradeLevel}` },
          {
            tenantId,
            classId: cls._id,
            name: def.name,
            code: `${def.prefix}${cls.gradeLevel}`,
            creditHours: def.credits,
          }
        )
      )
    ),
    'Subjects'
  );
  const subjectDocs = await Subject.find({ tenantId }, null, BYPASS).lean();
  // classId -> subjects in SUBJECT_DEFS order (period rotation depends on it)
  const subjectsByClass = new Map();
  for (const cls of classes) {
    const forClass = SUBJECT_DEFS.map((def) =>
      subjectDocs.find((s) => s.code === `${def.prefix}${cls.gradeLevel}`)
    ).filter(Boolean);
    subjectsByClass.set(cls._id.toString(), forClass);
  }

  // ── Staff ─────────────────────────────────────────────────────────────────
  log('\n── People ────────────────────────────────────────');
  const nextName = makeNameFactory();
  const existingUsers = await User.find({}, 'email', BYPASS).lean();
  const takenEmails = new Set(existingUsers.map((u) => u.email));
  const nextEmail = emailFactory(takenEmails);
  const passwordHash = await hashPassword(PASS); // hash once — every seeded user shares PASS

  const staffPlan = [];
  // 64 teachers: 8 per subject department so the timetable can always find a
  // free specialist for every (day, period, section) slot.
  for (let s = 0; s < SUBJECT_DEFS.length; s++) {
    for (let i = 0; i < TEACHERS_PER_SUBJECT; i++) {
      staffPlan.push({
        ...nextName(),
        designation: 'Teacher',
        department: SUBJECT_DEFS[s].department,
        subjectIndex: s,
        roleKey: 'teacher',
        basePay: 34000 + i * 1500,
      });
    }
  }
  for (const def of SUPPORT_STAFF) {
    staffPlan.push({
      ...nextName(),
      designation: def.designation,
      department: def.department,
      subjectIndex: null,
      roleKey: def.role,
      basePay: def.pay,
    });
  }

  // Canonical demo logins take over the matching designation (and keep their email)
  const fixedByDesignation = Object.fromEntries(
    Object.entries(FIXED_STAFF).map(([email, designation]) => [designation, email])
  );
  const usedFixed = new Set();
  for (const person of staffPlan) {
    const email = fixedByDesignation[person.designation];
    if (email && !usedFixed.has(email)) {
      person.email = email;
      usedFixed.add(email);
      takenEmails.add(email);
    }
  }
  // teacher@ is the demo teacher login — bind it to the first class teacher.
  staffPlan[0].email = `teacher@${EMAIL_DOMAIN}`;
  takenEmails.add(staffPlan[0].email);
  for (const person of staffPlan) {
    if (!person.email) person.email = nextEmail(person.firstName, person.lastName);
  }

  await flush(
    User,
    staffPlan.map((p) =>
      up({ email: p.email }, { email: p.email, passwordHash, systemRole: null, status: 'active' })
    ),
    'Staff user accounts'
  );
  const userDocs = await User.find(
    { email: { $in: staffPlan.map((p) => p.email) } },
    '_id email',
    BYPASS
  ).lean();
  const userByEmail = Object.fromEntries(userDocs.map((u) => [u.email, u]));
  staffPlan.forEach((p) => {
    p.userId = userByEmail[p.email]._id;
  });

  await flush(
    TenantMembership,
    staffPlan.map((p) =>
      up(
        { tenantId, userId: p.userId },
        {
          tenantId,
          userId: p.userId,
          roleIds: [roleByKey[p.roleKey]._id],
          status: 'active',
        }
      )
    ),
    'Memberships'
  );

  const staffOps = staffPlan.map((p, i) => {
    const employeeId = `GPS-${String(i + 1).padStart(4, '0')}`;
    p.employeeId = employeeId;
    const joinYear = 2014 + (i % 12);
    return up(
      { tenantId, employeeId },
      {
        tenantId,
        userId: p.userId,
        employeeId,
        firstName: p.firstName,
        lastName: p.lastName,
        dateOfBirth: utc(1975 + (i % 22), (i % 12) + 1, ((i * 7) % 27) + 1),
        gender: p.gender,
        phone: `+9198${String(10000000 + i * 137).slice(0, 8)}`,
        address: `${randInt(1, 120)}, ${pick(['MG Road', 'Nehru Nagar', 'Gandhi Colony', 'Sector 12', 'Anna Salai', 'Park Street'])}, ${pick(['Bengaluru', 'Pune', 'Jaipur', 'Kochi', 'Indore', 'Lucknow'])}`,
        designation: p.designation,
        department: p.department,
        joiningDate: utc(joinYear, (i % 12) + 1, 1),
        employmentStatus: i % 37 === 5 ? 'on_leave' : 'active',
        qualifications: [
          {
            degree:
              p.designation === 'Teacher'
                ? pick(['B.Ed', 'M.Ed', 'M.Sc', 'M.A'])
                : pick(['B.Com', 'MBA', 'B.A']),
            institution: pick([
              'Delhi University',
              'Savitribai Phule Pune University',
              'Bangalore University',
              'University of Calcutta',
              'Anna University',
            ]),
            year: joinYear - 2,
          },
        ],
        // Encryption lives in the route layer, not in a Mongoose setter — a raw
        // bulkWrite would store these in the clear, so encrypt them here.
        governmentId: encryptField(`ABCDE${1000 + i}F`, tenantId),
        bankAccount: encryptField(`50100${String(200000000 + i * 7919)}`, tenantId),
      }
    );
  });
  await flush(StaffMember, staffOps, 'Staff members');
  const staffDocs = await StaffMember.find({ tenantId }, null, BYPASS).lean();
  const staffByEmployeeId = Object.fromEntries(staffDocs.map((s) => [s.employeeId, s]));
  staffPlan.forEach((p) => {
    p.staffId = staffByEmployeeId[p.employeeId]?._id;
  });

  const teachers = staffPlan.filter((p) => p.designation === 'Teacher');
  const teachersBySubject = SUBJECT_DEFS.map((_, idx) =>
    teachers.filter((t) => t.subjectIndex === idx)
  );
  const principal = staffPlan.find((p) => p.designation === 'Principal');
  const vicePrincipal = staffPlan.find((p) => p.designation === 'Vice Principal');
  const adminOfficer = staffPlan.find((p) => p.designation === 'Admin Officer');
  const accountant = staffPlan.find((p) => p.designation === 'Accountant');
  const librarian = staffPlan.find((p) => p.designation === 'Librarian');

  // Class teachers: first 40 teachers, one per section, so every section has an
  // owner shown on rosters and used as the default attendance marker.
  await flush(
    Section,
    sections.map((sec, i) =>
      up(
        { tenantId, classId: sec.classId, name: sec.name },
        { classTeacherId: teachers[i % teachers.length].userId }
      )
    ),
    'Class teachers'
  );
  sections.forEach((sec, i) => {
    sec.classTeacher = teachers[i % teachers.length];
  });

  // ── Students ──────────────────────────────────────────────────────────────
  const perSection = Math.ceil(TARGET_STUDENTS / sections.length);
  const admissionYear = activeYear.startDate.getUTCFullYear();
  const studentPlan = [];
  let admissionSeq = 1;
  for (const sec of sections) {
    for (let i = 0; i < perSection && studentPlan.length < TARGET_STUDENTS; i++) {
      const { firstName, lastName, gender } = nextName();
      const age = 5 + sec.gradeLevel;
      const guardianRelation = chance(60) ? 'Father' : 'Mother';
      const guardianFirst = pick(guardianRelation === 'Father' ? MALE_FIRST : FEMALE_FIRST);
      studentPlan.push({
        admissionNo: `GPS/${admissionYear}/${String(admissionSeq++).padStart(4, '0')}`,
        firstName,
        lastName,
        gender,
        sectionId: sec._id,
        classId: sec.classId,
        gradeLevel: sec.gradeLevel,
        dateOfBirth: utc(admissionYear - age, randInt(1, 12), randInt(1, 28)),
        // ~4% of the roll is inactive so status filters have something to show.
        status: chance(2) ? 'graduated' : chance(2) ? 'withdrawn' : 'active',
        parentContacts: [
          {
            name: `${guardianFirst} ${lastName}`,
            phone: `+9197${String(10000000 + studentPlan.length * 91).slice(0, 8)}`,
            relation: guardianRelation,
          },
          ...(chance(35)
            ? [
                {
                  name: `${pick(guardianRelation === 'Father' ? FEMALE_FIRST : MALE_FIRST)} ${lastName}`,
                  phone: `+9196${String(20000000 + studentPlan.length * 73).slice(0, 8)}`,
                  relation: guardianRelation === 'Father' ? 'Mother' : 'Father',
                },
              ]
            : []),
        ],
      });
    }
  }

  await flush(
    Student,
    studentPlan.map((s) =>
      up(
        { tenantId, admissionNo: s.admissionNo },
        {
          tenantId,
          admissionNo: s.admissionNo,
          firstName: s.firstName,
          lastName: s.lastName,
          sectionId: s.sectionId,
          dateOfBirth: s.dateOfBirth,
          gender: s.gender,
          parentContacts: s.parentContacts,
          status: s.status,
        }
      )
    ),
    'Students'
  );
  const studentDocs = await Student.find({ tenantId }, null, BYPASS).lean();
  const studentByAdmission = Object.fromEntries(studentDocs.map((s) => [s.admissionNo, s]));
  studentPlan.forEach((s) => {
    s._id = studentByAdmission[s.admissionNo]?._id;
  });
  const studentsBySection = new Map(sections.map((sec) => [sec._id.toString(), []]));
  for (const s of studentPlan) {
    studentsBySection.get(s.sectionId.toString())?.push(s);
  }

  // ── Timetable ─────────────────────────────────────────────────────────────
  // Three unique indexes must hold at once: one entry per (section, day, period),
  // per (teacher, day, period) and per (room, day, period). Strategy: rotate the
  // subject by (sectionIndex + day + period) so each slot needs 40/8 = 5 sections
  // per subject, then hand those 5 sections distinct teachers from that subject's
  // pool of 8. Rooms are fixed per section, so room collisions are impossible.
  log('\n── Timetable ─────────────────────────────────────');
  const timetableOps = [];
  for (const day of WEEKDAYS) {
    for (let p = 0; p < PERIOD_TIMES.length; p++) {
      const claimed = new Map(); // subjectIndex -> teachers handed out this slot
      sections.forEach((sec, sIdx) => {
        const subjectIndex = (sIdx + day + p) % SUBJECT_DEFS.length;
        const pool = teachersBySubject[subjectIndex];
        const takenCount = claimed.get(subjectIndex) ?? 0;
        // Pool exhausted for this slot would double-book a teacher and trip the
        // (teacher, day, period) unique index — leave the cell empty instead.
        if (takenCount >= pool.length) return;
        const teacher = pool[takenCount];
        claimed.set(subjectIndex, takenCount + 1);
        const subject = subjectsByClass.get(sec.classId.toString())?.[subjectIndex];
        if (!subject) return;
        const [startTime, endTime] = PERIOD_TIMES[p];
        timetableOps.push(
          up(
            {
              tenantId,
              academicYearId: activeYear._id,
              sectionId: sec._id,
              dayOfWeek: day,
              periodNumber: p + 1,
            },
            {
              tenantId,
              academicYearId: activeYear._id,
              sectionId: sec._id,
              subjectId: subject._id,
              teacherId: teacher.userId,
              dayOfWeek: day,
              periodNumber: p + 1,
              startTime,
              endTime,
              room: sec.room,
            }
          )
        );
      });
    }
  }
  await flush(Timetable, timetableOps, 'Timetable slots');

  // 30 of 40 sections published; the rest stay draft so both states are visible.
  const publishedSections = sections.filter((_, i) => i % 4 !== 3);
  await flush(
    TimetablePublish,
    publishedSections.map((sec) =>
      up(
        { tenantId, academicYearId: activeYear._id, sectionId: sec._id },
        {
          tenantId,
          academicYearId: activeYear._id,
          sectionId: sec._id,
          publishedAt: addDays(TODAY, -randInt(10, 60)),
          publishedBy: adminOfficer.userId,
        }
      )
    ),
    'Timetable publishes'
  );

  // ── Attendance ────────────────────────────────────────────────────────────
  log('\n── Attendance ────────────────────────────────────');
  const attendanceDates = schoolDays(TODAY, ATTENDANCE_DAYS);
  const activeStudents = studentPlan.filter((s) => s.status === 'active');
  // A stable per-student attendance profile: most students are reliable, ~6% are
  // chronic defaulters so the <75% defaulter report is never empty.
  const profile = new Map(
    activeStudents.map((s) => {
      const roll = rand() * 100;
      if (roll < 6) return [s.admissionNo, { present: 62, late: 10, excused: 4 }];
      if (roll < 18) return [s.admissionNo, { present: 82, late: 8, excused: 3 }];
      return [s.admissionNo, { present: 94, late: 3, excused: 1 }];
    })
  );
  const sectionById = new Map(sections.map((sec) => [sec._id.toString(), sec]));
  const attendanceOps = [];
  for (const date of attendanceDates) {
    for (const s of activeStudents) {
      const sec = sectionById.get(s.sectionId.toString());
      const p = profile.get(s.admissionNo);
      const roll = rand() * 100;
      const status =
        roll < p.present
          ? 'present'
          : roll < p.present + p.late
            ? 'late'
            : roll < p.present + p.late + p.excused
              ? 'excused'
              : 'absent';
      attendanceOps.push(
        up(
          {
            tenantId,
            date,
            entityType: 'student',
            entityId: s._id,
            subjectId: null,
          },
          {
            tenantId,
            date,
            entityType: 'student',
            entityId: s._id,
            sectionId: s.sectionId,
            subjectId: null,
            status,
            markedBy: sec.classTeacher.userId,
            ...(status === 'excused'
              ? { note: pick(['Medical leave', 'Family function', 'Sports meet']) }
              : {}),
          }
        )
      );
    }
  }
  await flush(
    AttendanceRecord,
    attendanceOps,
    `Student attendance (${attendanceDates.length} days)`
  );

  // Staff attendance for the same window — the staff module reads these too.
  const staffAttendanceOps = [];
  for (const date of attendanceDates.slice(-5)) {
    for (const p of staffPlan) {
      staffAttendanceOps.push(
        up(
          { tenantId, date, entityType: 'staff', entityId: p.staffId, subjectId: null },
          {
            tenantId,
            date,
            entityType: 'staff',
            entityId: p.staffId,
            subjectId: null,
            status: chance(93) ? 'present' : chance(50) ? 'late' : 'absent',
            markedBy: adminOfficer.userId,
          }
        )
      );
    }
  }
  await flush(AttendanceRecord, staffAttendanceOps, 'Staff attendance (5 days)');

  // ── Grades ────────────────────────────────────────────────────────────────
  log('\n── Grades ────────────────────────────────────────');
  // Each student gets a latent ability, each subject a difficulty offset, so
  // rankings, class averages and top/bottom lists are internally consistent.
  // Sum of three uniforms ~ bell curve: mean ~73, tails at 48 and 98, so the
  // class looks like a real class instead of a flat spread of A-to-F.
  const ability = new Map(
    studentPlan.map((s) => [s.admissionNo, 48 + ((rand() + rand() + rand()) / 3) * 50])
  );
  const subjectDifficulty = SUBJECT_DEFS.map((_, i) => [-4, 2, -2, 1, 0, 3, 8, 6][i] ?? 0);
  function scoreFor(student, subjectIndex, spread) {
    const raw =
      ability.get(student.admissionNo) + subjectDifficulty[subjectIndex] + (rand() - 0.5) * spread;
    return Math.max(12, Math.min(100, Math.round(raw)));
  }

  const gradeRounds = [
    { term: term1, assessmentType: 'quiz', spread: 22 },
    { term: term1, assessmentType: 'midterm', spread: 16 },
    { term: term1, assessmentType: 'final', spread: 12 },
    { term: term2, assessmentType: 'quiz', spread: 22 },
  ];
  for (const round of gradeRounds) {
    const ops = [];
    for (const s of studentPlan) {
      if (s.status !== 'active') continue;
      const subjects = subjectsByClass.get(s.classId.toString()) ?? [];
      subjects.forEach((subject, subjectIndex) => {
        const score = scoreFor(s, subjectIndex, round.spread);
        const teacher = teachersBySubject[subjectIndex][s.gradeLevel % TEACHERS_PER_SUBJECT];
        ops.push(
          up(
            {
              tenantId,
              studentId: s._id,
              subjectId: subject._id,
              termId: round.term._id,
              assessmentType: round.assessmentType,
            },
            {
              tenantId,
              studentId: s._id,
              sectionId: s.sectionId,
              subjectId: subject._id,
              termId: round.term._id,
              academicYearId: activeYear._id,
              assessmentType: round.assessmentType,
              score,
              letterGrade: scoreToLetter(score),
              weightage: round.assessmentType === 'final' ? 2 : 1,
              gradedBy: teacher.userId,
              ...(score < 40 ? { remarks: 'Needs remedial support' } : {}),
            }
          )
        );
      });
    }
    await flush(Grade, ops, `Grades — ${round.term.name} ${round.assessmentType}`);
  }

  // Lock Term 1 finals for the first half of sections: published/locked grades
  // are the state teachers hit most often, so the demo must show both.
  const lockedSections = sections.slice(0, Math.floor(sections.length / 2));
  await flush(
    GradeLock,
    lockedSections.flatMap((sec) =>
      subjectsByClass.get(sec.classId.toString()).map((subject) =>
        up(
          {
            tenantId,
            sectionId: sec._id,
            subjectId: subject._id,
            termId: term1._id,
            assessmentType: 'final',
          },
          {
            tenantId,
            sectionId: sec._id,
            subjectId: subject._id,
            termId: term1._id,
            assessmentType: 'final',
            publishedAt: addDays(TODAY, -randInt(5, 30)),
            publishedBy: principal.userId,
          }
        )
      )
    ),
    'Grade locks (Term 1 finals)'
  );

  // Report-card generation history for a few sections (TTL-expiring metadata).
  await flush(
    ReportCardBatch,
    sections.slice(0, 6).map((sec, i) =>
      up(
        { tenantId, sectionId: sec._id, termId: term1._id, jobId: `seed-batch-${i + 1}` },
        {
          tenantId,
          sectionId: sec._id,
          termId: term1._id,
          requestedBy: principal.userId,
          jobId: `seed-batch-${i + 1}`,
          status: i === 5 ? 'failed' : 'completed',
          ...(i === 5
            ? { error: 'No grades found for section' }
            : { s3Key: `report-cards/${sec._id}-${term1._id}.pdf` }),
        }
      )
    ),
    'Report card batches'
  );

  // ── Fees ──────────────────────────────────────────────────────────────────
  log('\n── Fees ──────────────────────────────────────────');
  const feeTiers = [
    {
      name: 'Primary Fee (Grade 1-5)',
      grades: [1, 2, 3, 4, 5],
      tuition: 28000,
      transport: 9000,
      activity: 3500,
    },
    {
      name: 'Middle School Fee (Grade 6-8)',
      grades: [6, 7, 8],
      tuition: 36000,
      transport: 10000,
      activity: 4500,
    },
    {
      name: 'Secondary Fee (Grade 9-10)',
      grades: [9, 10],
      tuition: 45000,
      transport: 11000,
      activity: 6000,
    },
  ];
  const feeYearStart = activeYear.startDate.getUTCFullYear();
  await flush(
    FeeStructure,
    feeTiers.map((tier) => {
      const total = tier.tuition + tier.transport + tier.activity;
      return up(
        { tenantId, name: tier.name, academicYearId: activeYear._id },
        {
          tenantId,
          name: tier.name,
          academicYearId: activeYear._id,
          components: [
            { label: 'Tuition', amount: tier.tuition, isOptional: false },
            { label: 'Transport', amount: tier.transport, isOptional: true },
            { label: 'Activity & Lab', amount: tier.activity, isOptional: false },
          ],
          applicableTo: 'all',
          dueDate: utc(feeYearStart, 4, 30),
          installments: [
            { label: 'Term 1', amount: Math.round(total * 0.4), dueDate: utc(feeYearStart, 4, 30) },
            { label: 'Term 2', amount: Math.round(total * 0.3), dueDate: utc(feeYearStart, 9, 15) },
            {
              label: 'Term 3',
              amount: total - Math.round(total * 0.4) - Math.round(total * 0.3),
              dueDate: utc(feeYearStart + 1, 1, 15),
            },
          ],
          lateFeeEnabled: true,
          lateFeeType: 'flat',
          lateFeeValue: 500,
          lateFeeGraceDays: 7,
          isActive: true,
        }
      );
    }),
    'Fee structures'
  );
  const feeStructures = await FeeStructure.find(
    { tenantId, academicYearId: activeYear._id },
    null,
    BYPASS
  ).lean();
  const structureForGrade = (gradeLevel) => {
    const tier = feeTiers.find((t) => t.grades.includes(gradeLevel)) ?? feeTiers[0];
    return feeStructures.find((f) => f.name === tier.name);
  };

  await flush(
    FeeDiscount,
    [
      { name: 'Sibling Concession', type: 'percentage', value: 10 },
      { name: 'Staff Ward', type: 'percentage', value: 50 },
      { name: 'Merit Scholarship', type: 'flat', value: 8000 },
      { name: 'RTE Quota', type: 'percentage', value: 100 },
    ].map((d) =>
      up(
        { tenantId, name: d.name, academicYearId: activeYear._id },
        { tenantId, ...d, applicableTo: 'all', academicYearId: activeYear._id }
      )
    ),
    'Fee discounts'
  );

  const assignmentOps = [];
  const feePlan = [];
  for (const s of studentPlan) {
    if (s.status === 'withdrawn') continue;
    const structure = structureForGrade(s.gradeLevel);
    const totalAmount = structure.components.reduce((sum, c) => sum + c.amount, 0);
    const discountRoll = rand() * 100;
    const discountAmount =
      discountRoll < 4
        ? Math.round(totalAmount * 0.5)
        : discountRoll < 12
          ? Math.round(totalAmount * 0.1)
          : discountRoll < 15
            ? 8000
            : 0;
    const discountReason =
      discountAmount === 0
        ? undefined
        : discountRoll < 4
          ? 'Staff Ward'
          : discountRoll < 12
            ? 'Sibling Concession'
            : 'Merit Scholarship';
    const payable = totalAmount - discountAmount;
    const statusRoll = rand() * 100;
    const status = statusRoll < 58 ? 'paid' : statusRoll < 84 ? 'partial' : 'unpaid';
    const installments = structure.installments.map((inst, idx) => {
      const share = Math.round(inst.amount * (payable / totalAmount));
      const paidAmount = status === 'paid' ? share : status === 'partial' && idx === 0 ? share : 0;
      return {
        label: inst.label,
        amount: share,
        dueDate: inst.dueDate,
        status: paidAmount >= share ? 'paid' : paidAmount > 0 ? 'partial' : 'unpaid',
        paidAmount,
      };
    });
    const overdue = status !== 'paid' && chance(35);
    feePlan.push({ student: s, status, payable, installments, structure });
    assignmentOps.push(
      up(
        { tenantId, studentId: s._id, academicYearId: activeYear._id },
        {
          tenantId,
          studentId: s._id,
          feeStructureId: structure._id,
          academicYearId: activeYear._id,
          totalAmount,
          discountAmount,
          discountReason,
          lateFeeAmount: overdue ? 500 : 0,
          dueDate: structure.dueDate,
          installments,
          status,
        }
      )
    );
  }
  await flush(FeeAssignment, assignmentOps, 'Fee assignments');
  const assignmentDocs = await FeeAssignment.find(
    { tenantId, academicYearId: activeYear._id },
    null,
    BYPASS
  ).lean();
  const assignmentByStudent = new Map(assignmentDocs.map((a) => [a.studentId.toString(), a]));

  const PAYMENT_METHODS = ['cash', 'card', 'upi', 'bank_transfer', 'cheque'];
  const paymentOps = [];
  let receiptSeq = 1;
  for (const row of feePlan) {
    const assignment = assignmentByStudent.get(row.student._id.toString());
    if (!assignment) continue;
    row.installments.forEach((inst, idx) => {
      if (inst.paidAmount <= 0) return;
      const receiptNumber = `RCPT/${feeYearStart}/${String(receiptSeq++).padStart(5, '0')}`;
      const method = pick(PAYMENT_METHODS);
      paymentOps.push(
        up(
          { tenantId, receiptNumber },
          {
            tenantId,
            assignmentId: assignment._id,
            studentId: row.student._id,
            amount: inst.paidAmount,
            paymentMethod: method,
            transactionId: method === 'cash' ? undefined : `TXN${randInt(100000000, 999999999)}`,
            receiptNumber,
            paymentDate: addDays(inst.dueDate, -randInt(0, 12)),
            collectedBy: accountant.userId,
            installmentIndex: idx,
            notes: method === 'cheque' ? `Cheque no. ${randInt(100000, 999999)}` : undefined,
          }
        )
      );
    });
  }
  await flush(FeePayment, paymentOps, 'Fee payments');

  // ── Payroll ───────────────────────────────────────────────────────────────
  log('\n── Payroll & leave ───────────────────────────────');
  const salaryStructureDefs = [
    {
      name: 'Teaching Staff',
      components: [
        { label: 'Basic', type: 'earning', amount: 35000, isPercentage: false },
        { label: 'HRA', type: 'earning', amount: 40, isPercentage: true, baseRef: 'Basic' },
        {
          label: 'Provident Fund',
          type: 'deduction',
          amount: 12,
          isPercentage: true,
          baseRef: 'Basic',
        },
      ],
    },
    {
      name: 'Administrative Staff',
      components: [
        { label: 'Basic', type: 'earning', amount: 45000, isPercentage: false },
        { label: 'HRA', type: 'earning', amount: 35, isPercentage: true, baseRef: 'Basic' },
        {
          label: 'Provident Fund',
          type: 'deduction',
          amount: 12,
          isPercentage: true,
          baseRef: 'Basic',
        },
      ],
    },
    {
      name: 'Support Staff',
      components: [
        { label: 'Basic', type: 'earning', amount: 24000, isPercentage: false },
        { label: 'HRA', type: 'earning', amount: 30, isPercentage: true, baseRef: 'Basic' },
      ],
    },
  ];
  await flush(
    SalaryStructure,
    salaryStructureDefs.map((s) => up({ tenantId, name: s.name }, { tenantId, ...s })),
    'Salary structures'
  );
  const salaryStructures = await SalaryStructure.find({ tenantId }, null, BYPASS).lean();
  const structureByName = Object.fromEntries(salaryStructures.map((s) => [s.name, s]));
  const structureFor = (person) =>
    person.designation === 'Teacher'
      ? structureByName['Teaching Staff']
      : [
            'Principal',
            'Vice Principal',
            'Admin Officer',
            'Accountant',
            'Accounts Assistant',
          ].includes(person.designation)
        ? structureByName['Administrative Staff']
        : structureByName['Support Staff'];

  await flush(
    StaffMember,
    staffPlan.map((p) =>
      up({ tenantId, employeeId: p.employeeId }, { salaryStructureId: structureFor(p)._id })
    ),
    'Staff salary structure links'
  );

  const payrollMonths = [0, 1, 2].map((back) => {
    const d = new Date(Date.UTC(TODAY.getUTCFullYear(), TODAY.getUTCMonth() - back, 1));
    return { month: d.getUTCMonth() + 1, year: d.getUTCFullYear(), isCurrent: back === 0 };
  });
  const slipOps = [];
  for (const { month, year, isCurrent } of payrollMonths) {
    for (const p of staffPlan) {
      const basic = p.basePay;
      const hra = Math.round(basic * (p.designation === 'Teacher' ? 0.4 : 0.35));
      const pf = Math.round(basic * 0.12);
      const gross = basic + hra;
      slipOps.push(
        up(
          { tenantId, staffId: p.staffId, month, year },
          {
            tenantId,
            staffId: p.staffId,
            month,
            year,
            components: [
              { label: 'Basic', type: 'earning', amount: basic },
              { label: 'HRA', type: 'earning', amount: hra },
              { label: 'Provident Fund', type: 'deduction', amount: pf },
            ],
            grossEarnings: gross,
            totalDeductions: pf,
            netPay: gross - pf,
            status: isCurrent ? 'generated' : 'paid',
          }
        )
      );
    }
  }
  await flush(SalarySlip, slipOps, `Salary slips (${payrollMonths.length} months)`);

  // ── Leave ─────────────────────────────────────────────────────────────────
  const leaveTypeDefs = [
    { name: 'Casual', maxDaysPerYear: 12, isPaid: true, requiresApproval: true },
    { name: 'Sick', maxDaysPerYear: 10, isPaid: true, requiresApproval: true },
    { name: 'Earned', maxDaysPerYear: 15, isPaid: true, requiresApproval: true },
    { name: 'Unpaid', maxDaysPerYear: 30, isPaid: false, requiresApproval: true },
  ];
  await flush(
    LeaveType,
    leaveTypeDefs.map((d) => up({ tenantId, name: d.name }, { tenantId, ...d })),
    'Leave types'
  );
  const leaveTypes = await LeaveType.find({ tenantId }, null, BYPASS).lean();
  const leaveYear = TODAY.getUTCFullYear();
  await flush(
    LeaveBalance,
    staffPlan.flatMap((p) =>
      leaveTypes.map((lt) =>
        up(
          { tenantId, staffId: p.staffId, leaveTypeId: lt._id, year: leaveYear },
          {
            tenantId,
            staffId: p.staffId,
            leaveTypeId: lt._id,
            year: leaveYear,
            total: lt.maxDaysPerYear,
            used: randInt(0, Math.max(1, Math.floor(lt.maxDaysPerYear / 3))),
          }
        )
      )
    ),
    'Leave balances'
  );

  const leaveReasons = [
    'Family function',
    'Medical appointment',
    'Fever and rest advised',
    'Child care',
    'Out-of-station travel',
    'House shifting',
    'Exam duty at another centre',
  ];
  const leaveOps = [];
  for (let i = 0; i < 80; i++) {
    const person = staffPlan[(i * 7) % staffPlan.length];
    const lt = leaveTypes[i % leaveTypes.length];
    const fromDate = addDays(TODAY, randInt(-70, 25));
    const totalDays = randInt(1, 4);
    const statusRoll = rand() * 100;
    const status =
      statusRoll < 30
        ? 'pending'
        : statusRoll < 78
          ? 'approved'
          : statusRoll < 92
            ? 'rejected'
            : 'cancelled';
    const approvers = person.designation === 'Teacher' ? [vicePrincipal, principal] : [principal];
    leaveOps.push(
      up(
        { tenantId, staffId: person.staffId, leaveTypeId: lt._id, fromDate },
        {
          tenantId,
          staffId: person.staffId,
          leaveTypeId: lt._id,
          fromDate,
          toDate: addDays(fromDate, totalDays - 1),
          totalDays,
          reason: pick(leaveReasons),
          status,
          approvalChain: approvers.map((a, idx) => ({
            approverId: a.userId,
            status:
              status === 'pending'
                ? idx === 0
                  ? 'pending'
                  : 'pending'
                : status === 'rejected' && idx === approvers.length - 1
                  ? 'rejected'
                  : status === 'cancelled'
                    ? 'pending'
                    : 'approved',
            actedAt:
              status === 'pending' || status === 'cancelled'
                ? undefined
                : addDays(fromDate, -randInt(1, 5)),
          })),
          currentApproverIndex: status === 'pending' ? 0 : approvers.length,
          conflictFlags: chance(15) ? ['overlaps_class_schedule'] : [],
        }
      )
    );
  }
  await flush(LeaveRequest, leaveOps, 'Leave requests');

  // ── Expenses & budgets ────────────────────────────────────────────────────
  log('\n── Expense & inventory ───────────────────────────');
  const costCenterDefs = [
    { name: 'Academics', code: 'ACAD', budget: 1800000 },
    { name: 'Administration', code: 'ADMIN', budget: 950000 },
    { name: 'Facilities & Maintenance', code: 'FAC', budget: 1250000 },
    { name: 'Transport', code: 'TRANS', budget: 1600000 },
    { name: 'Sports & Culture', code: 'SPORT', budget: 600000 },
    { name: 'IT & Labs', code: 'IT', budget: 850000 },
  ];
  await flush(
    CostCenter,
    costCenterDefs.map((c) => up({ tenantId, code: c.code }, { tenantId, ...c })),
    'Cost centers'
  );
  const costCenters = await CostCenter.find({ tenantId }, null, BYPASS).lean();

  const expenseCatalogue = [
    {
      title: 'Electricity bill',
      category: 'utilities',
      vendor: 'State Power Board',
      min: 42000,
      max: 96000,
      cc: 'FAC',
    },
    {
      title: 'Water tanker supply',
      category: 'utilities',
      vendor: 'AquaFresh Suppliers',
      min: 8000,
      max: 18000,
      cc: 'FAC',
    },
    {
      title: 'School bus diesel',
      category: 'transport',
      vendor: 'Bharat Fuels',
      min: 55000,
      max: 120000,
      cc: 'TRANS',
    },
    {
      title: 'Bus tyre replacement',
      category: 'transport',
      vendor: 'MRF Tyre House',
      min: 24000,
      max: 62000,
      cc: 'TRANS',
    },
    {
      title: 'Science lab consumables',
      category: 'supplies',
      vendor: 'Scientific Aids Pvt Ltd',
      min: 12000,
      max: 45000,
      cc: 'ACAD',
    },
    {
      title: 'Library book purchase',
      category: 'supplies',
      vendor: 'Sapna Book House',
      min: 18000,
      max: 70000,
      cc: 'ACAD',
    },
    {
      title: 'Stationery bulk order',
      category: 'supplies',
      vendor: 'Kalyan Stationers',
      min: 9000,
      max: 32000,
      cc: 'ADMIN',
    },
    {
      title: 'Computer lab AMC',
      category: 'maintenance',
      vendor: 'TechCare Systems',
      min: 30000,
      max: 75000,
      cc: 'IT',
    },
    {
      title: 'Projector bulb replacement',
      category: 'maintenance',
      vendor: 'TechCare Systems',
      min: 6000,
      max: 14000,
      cc: 'IT',
    },
    {
      title: 'Annual day stage setup',
      category: 'events',
      vendor: 'Sunrise Events',
      min: 45000,
      max: 160000,
      cc: 'SPORT',
    },
    {
      title: 'Inter-school sports kit',
      category: 'sports',
      vendor: 'Decathlon Bulk',
      min: 22000,
      max: 68000,
      cc: 'SPORT',
    },
    {
      title: 'Housekeeping contract',
      category: 'services',
      vendor: 'CleanPro Facility',
      min: 38000,
      max: 52000,
      cc: 'FAC',
    },
    {
      title: 'Teacher training workshop',
      category: 'training',
      vendor: 'EduSkill Academy',
      min: 25000,
      max: 90000,
      cc: 'ACAD',
    },
    {
      title: 'Printing of report cards',
      category: 'printing',
      vendor: 'Sharp Print House',
      min: 7000,
      max: 22000,
      cc: 'ADMIN',
    },
  ];
  const expenseOps = [];
  for (let i = 0; i < 84; i++) {
    const def = expenseCatalogue[i % expenseCatalogue.length];
    const invoiceDate = addDays(TODAY, -randInt(0, 150));
    const monthLabel = invoiceDate.toLocaleString('en-IN', {
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    });
    const statusRoll = rand() * 100;
    const status =
      statusRoll < 14
        ? 'pending'
        : statusRoll < 24
          ? 'approved'
          : statusRoll < 30
            ? 'rejected'
            : statusRoll < 34
              ? 'draft'
              : 'paid';
    const cc = costCenters.find((c) => c.code === def.cc);
    const title = `${def.title} — ${monthLabel} #${i + 1}`;
    const chainRoles = [
      { person: vicePrincipal, role: 'vice principal' },
      { person: principal, role: 'principal' },
    ];
    expenseOps.push(
      up(
        { tenantId, title },
        {
          tenantId,
          title,
          category: def.category,
          amount: randInt(def.min, def.max),
          currency: 'INR',
          paymentMethod: pick(['bank_transfer', 'upi', 'cash', 'card']),
          vendor: def.vendor,
          invoiceDate,
          costCenterId: cc._id,
          submittedBy: (i % 3 === 0 ? adminOfficer : accountant).userId,
          status,
          approvalChain: chainRoles.map((step, idx) => ({
            approverId: step.person.userId,
            role: step.role,
            status:
              status === 'draft' || status === 'pending'
                ? 'pending'
                : status === 'rejected' && idx === chainRoles.length - 1
                  ? 'rejected'
                  : 'approved',
            actedAt:
              status === 'draft' || status === 'pending'
                ? undefined
                : addDays(invoiceDate, idx + 1),
            comment:
              status === 'rejected' && idx === chainRoles.length - 1
                ? 'Quote too high — get two more vendors'
                : undefined,
          })),
          currentApproverIndex: status === 'draft' || status === 'pending' ? 0 : chainRoles.length,
          isReimbursement: chance(12),
          paidAt: status === 'paid' ? addDays(invoiceDate, randInt(3, 20)) : undefined,
        }
      )
    );
  }
  await flush(ExpenseEntry, expenseOps, 'Expense entries');

  const budgetOps = [];
  for (const cc of costCenters) {
    budgetOps.push(
      up(
        {
          tenantId,
          costCenterId: cc._id,
          year: TODAY.getUTCFullYear(),
          period: 'annual',
          month: null,
        },
        {
          tenantId,
          costCenterId: cc._id,
          period: 'annual',
          year: TODAY.getUTCFullYear(),
          cap: cc.budget,
          spent: Math.round(cc.budget * (0.25 + rand() * 0.6)),
        }
      )
    );
    for (let back = 0; back < 3; back++) {
      const d = new Date(Date.UTC(TODAY.getUTCFullYear(), TODAY.getUTCMonth() - back, 1));
      const cap = Math.round(cc.budget / 12);
      budgetOps.push(
        up(
          {
            tenantId,
            costCenterId: cc._id,
            year: d.getUTCFullYear(),
            month: d.getUTCMonth() + 1,
            period: 'monthly',
          },
          {
            tenantId,
            costCenterId: cc._id,
            period: 'monthly',
            year: d.getUTCFullYear(),
            month: d.getUTCMonth() + 1,
            cap,
            spent: Math.round(cap * (0.3 + rand() * 0.9)),
          }
        )
      );
    }
  }
  await flush(Budget, budgetOps, 'Budgets');

  // ── Inventory ─────────────────────────────────────────────────────────────
  const consumableCatalogue = [
    ['Whiteboard Marker (Black)', 'stationery', 12, 400, 80],
    ['Whiteboard Marker (Blue)', 'stationery', 12, 260, 80],
    ['Duster', 'stationery', 45, 90, 25],
    ['Chalk Box (100s)', 'stationery', 60, 45, 30],
    ['A4 Copier Paper (ream)', 'stationery', 320, 140, 40],
    ['Notebook — Ruled 200pg', 'stationery', 55, 900, 200],
    ['Graph Book', 'stationery', 40, 210, 60],
    ['Answer Sheet Bundle', 'examination', 180, 75, 40],
    ['Beaker 250ml', 'lab', 95, 120, 30],
    ['Test Tube (pack of 20)', 'lab', 210, 34, 25],
    ['Litmus Paper Book', 'lab', 60, 28, 20],
    ['Sodium Chloride 500g', 'lab', 140, 18, 15],
    ['Microscope Slide Box', 'lab', 260, 22, 12],
    ['First Aid Kit Refill', 'medical', 850, 14, 8],
    ['Hand Sanitiser 5L', 'housekeeping', 620, 26, 12],
    ['Floor Cleaner 5L', 'housekeeping', 480, 31, 15],
    ['Toilet Paper (carton)', 'housekeeping', 720, 19, 10],
    ['Garbage Bags (roll)', 'housekeeping', 95, 64, 30],
    ['Cricket Ball', 'sports', 320, 42, 20],
    ['Shuttlecock (tube)', 'sports', 380, 17, 12],
    ['Football', 'sports', 950, 12, 6],
    ['Basketball', 'sports', 1150, 8, 5],
    ['Skipping Rope', 'sports', 140, 55, 20],
    ['Printer Toner 12A', 'it', 2400, 9, 6],
    ['HDMI Cable 3m', 'it', 340, 21, 10],
    ['Extension Board 6-way', 'it', 520, 14, 8],
    ['LED Tube Light 20W', 'electrical', 260, 48, 20],
    ['Ceiling Fan Regulator', 'electrical', 180, 23, 12],
    ['Door Lock', 'maintenance', 420, 17, 10],
    ['Paint 4L (white)', 'maintenance', 1450, 11, 6],
    ['Art Paper Sheets (pack)', 'arts', 240, 62, 25],
    ['Poster Colour Set', 'arts', 310, 38, 15],
    ['Clay Modelling Pack', 'arts', 190, 27, 12],
    ['Music Sheet Folder', 'arts', 95, 44, 20],
    ['ID Card Blanks (pack)', 'admin', 550, 13, 8],
    ['Lanyard', 'admin', 45, 210, 50],
    ['File Folder', 'admin', 38, 320, 80],
    ['Register (200pg)', 'admin', 165, 47, 20],
    ['Water Bottle (staff)', 'admin', 220, 26, 12],
    ['Uniform Badge', 'admin', 30, 480, 100],
  ];
  const consumableOps = consumableCatalogue.map(
    ([name, category, unitCost, quantity, reorderLevel], i) => {
      const sku = `CON-${String(1001 + i)}`;
      // Every 7th item sits below its reorder level so the low-stock view is alive.
      const qty = i % 7 === 3 ? Math.max(0, Math.floor(reorderLevel * 0.6)) : quantity;
      return up(
        { tenantId, sku },
        {
          tenantId,
          sku,
          name,
          category,
          unitCost,
          quantity: qty,
          reorderLevel,
          itemType: 'consumable',
          location: pick(['Central Store', 'Science Block Store', 'Sports Room', 'Admin Store']),
          custodianId: librarian.userId,
        }
      );
    }
  );
  await flush(Consumable, consumableOps, 'Consumables');

  const assetCatalogue = [
    ['Interactive Projector', 'electronics', 68000, 8, 'good'],
    ['Desktop Computer i5', 'electronics', 42000, 6, 'good'],
    ['Laptop — Staff Room', 'electronics', 58000, 5, 'fair'],
    ['Network Switch 24-port', 'electronics', 18000, 7, 'good'],
    ['Wi-Fi Access Point', 'electronics', 9500, 5, 'good'],
    ['Printer — Admin Office', 'electronics', 24000, 5, 'fair'],
    ['Photocopier', 'electronics', 165000, 8, 'good'],
    ['Public Address System', 'electronics', 78000, 10, 'good'],
    ['CCTV Camera Set', 'electronics', 96000, 6, 'good'],
    ['Smart Board', 'electronics', 145000, 8, 'good'],
    ['Student Desk (set of 10)', 'furniture', 32000, 12, 'good'],
    ['Teacher Table', 'furniture', 8500, 15, 'fair'],
    ['Library Bookshelf', 'furniture', 12000, 15, 'good'],
    ['Staff Room Sofa', 'furniture', 26000, 10, 'fair'],
    ['Almirah — Records', 'furniture', 14500, 20, 'good'],
    ['Lab Workbench', 'furniture', 38000, 15, 'good'],
    ['Examination Bench', 'furniture', 4200, 12, 'poor'],
    ['Science Lab Microscope', 'lab', 34000, 10, 'good'],
    ['Physics Optics Kit', 'lab', 18500, 8, 'good'],
    ['Chemistry Fume Hood', 'lab', 92000, 12, 'good'],
    ['Biology Skeleton Model', 'lab', 22000, 15, 'fair'],
    ['School Bus (32-seater)', 'vehicle', 1850000, 12, 'good'],
    ['School Van', 'vehicle', 780000, 10, 'fair'],
    ['Water Purifier RO 100L', 'facilities', 46000, 7, 'good'],
    ['Generator 15kVA', 'facilities', 265000, 12, 'good'],
    ['Solar Panel Array', 'facilities', 480000, 20, 'good'],
    ['Fire Extinguisher Set', 'facilities', 18000, 8, 'good'],
    ['Basketball Hoop Set', 'sports', 42000, 10, 'fair'],
    ['Table Tennis Table', 'sports', 28000, 8, 'good'],
    ['Gym Equipment Set', 'sports', 96000, 10, 'poor'],
  ];
  const assetOps = assetCatalogue.map(
    ([name, category, unitCost, usefulLifeYears, condition], i) => {
      const sku = `FA-${String(2001 + i)}`;
      const purchaseDate = addDays(TODAY, -randInt(200, 2600));
      const ageYears = (TODAY - purchaseDate) / (365 * DAY_MS);
      const currentValue = Math.max(
        Math.round(unitCost * 0.05),
        Math.round(unitCost * (1 - Math.min(1, ageYears / usefulLifeYears)))
      );
      return up(
        { tenantId, sku },
        {
          tenantId,
          sku,
          name,
          category,
          unitCost,
          itemType: 'fixed_asset',
          assetId: `GPS/AST/${String(i + 1).padStart(3, '0')}`,
          purchaseDate,
          depreciationMethod: i % 3 === 0 ? 'wdv' : 'slm',
          usefulLifeYears,
          currentValue,
          condition,
          location: pick([
            'Block A',
            'Block B',
            'Science Block',
            'Admin Office',
            'Playground',
            'Library',
          ]),
          custodianId: (i % 2 === 0 ? librarian : adminOfficer).userId,
        }
      );
    }
  );
  await flush(FixedAsset, assetOps, 'Fixed assets');

  const items = await InventoryItem.find({ tenantId }, null, BYPASS).lean();
  const consumables = items.filter((i) => i.itemType === 'consumable');
  const assets = items.filter((i) => i.itemType === 'fixed_asset');

  const movementOps = [];
  for (let i = 0; i < 70; i++) {
    const item = i % 3 === 0 ? pick(assets) : pick(consumables);
    const movementType = i % 5 === 0 ? 'purchase' : i % 5 === 4 ? 'return' : 'issue';
    const createdAt = addDays(TODAY, -randInt(0, 120));
    const holder = staffPlan[(i * 11) % staffPlan.length];
    const referenceId = `MOV-${String(i + 1).padStart(4, '0')}`;
    const dueDate = movementType === 'issue' ? addDays(createdAt, randInt(-15, 30)) : undefined;
    movementOps.push(
      up(
        { tenantId, referenceId },
        {
          tenantId,
          itemId: item._id,
          movementType,
          quantity: item.itemType === 'consumable' ? randInt(1, 25) : 1,
          unitCost: item.unitCost,
          fromLocation: movementType === 'issue' ? item.location : 'Vendor',
          toLocation:
            movementType === 'issue'
              ? pick(['Grade 5-A', 'Science Lab 1', 'Staff Room', 'Library'])
              : item.location,
          issuedTo:
            movementType === 'issue'
              ? { entityType: 'staff', entityId: holder.staffId }
              : undefined,
          dueDate,
          // A few issues stay open past their due date to exercise the overdue worker.
          returnedAt: movementType === 'return' ? addDays(createdAt, randInt(1, 10)) : undefined,
          reason:
            movementType === 'purchase'
              ? 'Term restock'
              : movementType === 'return'
                ? 'Returned after use'
                : 'Classroom requirement',
          movedBy: librarian.userId,
          referenceId,
        }
      )
    );
  }
  await flush(StockMovement, movementOps, 'Stock movements');

  const requisitionOps = [];
  for (let i = 0; i < 14; i++) {
    const item = pick(consumables);
    const reason = `${pick(['Term restock', 'Board exam prep', 'New section requirement', 'Damaged stock replacement'])} #${i + 1}`;
    const statusRoll = rand() * 100;
    const status =
      statusRoll < 40
        ? 'pending'
        : statusRoll < 70
          ? 'approved'
          : statusRoll < 85
            ? 'ordered'
            : 'rejected';
    requisitionOps.push(
      up(
        { tenantId, itemId: item._id, reason },
        {
          tenantId,
          itemId: item._id,
          requestedQuantity: randInt(10, 300),
          reason,
          status,
          requestedBy: librarian.userId,
          approvedBy: status === 'pending' ? undefined : principal.userId,
        }
      )
    );
  }
  await flush(PurchaseRequisition, requisitionOps, 'Purchase requisitions');

  // ── Notifications ─────────────────────────────────────────────────────────
  const notificationDefs = [
    {
      user: principal,
      title: 'Leave approvals pending',
      body: '9 leave requests are waiting on you.',
      type: 'warning',
      link: '/staff/leaves',
    },
    {
      user: principal,
      title: 'Grades locked',
      body: 'Term 1 finals were locked for 20 sections.',
      type: 'success',
      link: '/academic/grades',
    },
    {
      user: adminOfficer,
      title: 'Timetable drafts',
      body: '10 sections still have an unpublished timetable.',
      type: 'warning',
      link: '/academic/timetable',
    },
    {
      user: adminOfficer,
      title: 'Low stock',
      body: '6 consumables dropped below reorder level.',
      type: 'warning',
      link: '/inventory',
    },
    {
      user: accountant,
      title: 'Fee defaulters',
      body: `${Math.round(TARGET_STUDENTS * 0.16)} students have an unpaid Term 1 installment.`,
      type: 'error',
      link: '/fee',
    },
    {
      user: accountant,
      title: 'Payroll generated',
      body: 'Salary slips for this month are ready to pay.',
      type: 'info',
      link: '/staff/salary',
    },
    {
      user: staffPlan[0],
      title: 'Attendance not marked',
      body: 'Grade 1-A has no attendance for today.',
      type: 'warning',
      link: '/academic/attendance',
    },
    {
      user: staffPlan[0],
      title: 'Report card ready',
      body: 'Term 1 report cards for your class can be downloaded.',
      type: 'success',
      link: '/academic/report-cards',
    },
  ];
  await flush(
    Notification,
    notificationDefs.map((n) =>
      up(
        { tenantId, userId: n.user.userId, title: n.title },
        {
          tenantId,
          userId: n.user.userId,
          title: n.title,
          body: n.body,
          type: n.type,
          read: false,
          link: n.link,
        }
      )
    ),
    'Notifications'
  );

  // ── Summary ───────────────────────────────────────────────────────────────
  const counts = {
    students: await Student.countDocuments({ tenantId }, BYPASS),
    activeStudents: await Student.countDocuments({ tenantId, status: 'active' }, BYPASS),
    staff: await StaffMember.countDocuments({ tenantId }, BYPASS),
    classes: await Class.countDocuments({ tenantId }, BYPASS),
    sections: await Section.countDocuments({ tenantId }, BYPASS),
    subjects: await Subject.countDocuments({ tenantId }, BYPASS),
    timetableSlots: await Timetable.countDocuments({ tenantId }, BYPASS),
    attendanceRecords: await AttendanceRecord.countDocuments({ tenantId }, BYPASS),
    grades: await Grade.countDocuments({ tenantId }, BYPASS),
    feeAssignments: await FeeAssignment.countDocuments({ tenantId }, BYPASS),
    feePayments: await FeePayment.countDocuments({ tenantId }, BYPASS),
    salarySlips: await SalarySlip.countDocuments({ tenantId }, BYPASS),
    leaveRequests: await LeaveRequest.countDocuments({ tenantId }, BYPASS),
    expenses: await ExpenseEntry.countDocuments({ tenantId }, BYPASS),
    inventoryItems: await InventoryItem.countDocuments({ tenantId }, BYPASS),
  };

  await mongoose.disconnect();

  console.log(
    JSON.stringify(
      {
        tenant: { name: tenant.name, subdomain: SUBDOMAIN },
        activeYear: activeYear.name,
        terms: terms.map((t) => t.name),
        counts,
        logins: {
          password: PASS,
          superAdmin: 'admin@test.local',
          tenantAdmin: `tadmin@${EMAIL_DOMAIN}`,
          principal: `principal@${EMAIL_DOMAIN}`,
          classTeacher: `teacher@${EMAIL_DOMAIN}`,
          librarian: `viewer@${EMAIL_DOMAIN}`,
          accountant: accountant.email,
          sampleTeachers: teachers
            .slice(1, 6)
            .map((t) => `${t.firstName} ${t.lastName} <${t.email}>`),
        },
        elapsedSeconds: Math.round((Date.now() - started) / 1000),
      },
      null,
      2
    )
  );
  process.exit(0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
