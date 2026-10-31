import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { AcademicYear } from '../models/AcademicYear.js';
import { Term } from '../models/Term.js';
import { Class } from '../models/Class.js';
import { Section } from '../models/Section.js';
import { Subject } from '../models/Subject.js';
import { SubjectTeacher } from '../models/SubjectTeacher.js';
import { Timetable } from '../models/Timetable.js';
import { loadTeachingLoad } from '../services/teachingLoad.service.js';

let mongod;
const id = () => new mongoose.Types.ObjectId();
const tenantId = id();
const otherTenantId = id();
const teacherId = id();
const otherTeacherId = id();

async function setup(tid, { active = true } = {}) {
  const year = await AcademicYear.create({
    tenantId: tid,
    name: '2026',
    startDate: new Date('2026-04-01'),
    endDate: new Date('2027-03-31'),
    isActive: active,
  });
  const terms = await Term.create([
    {
      tenantId: tid,
      academicYearId: year._id,
      name: 'T1',
      startDate: new Date('2026-04-01'),
      endDate: new Date('2026-09-30'),
    },
    {
      tenantId: tid,
      academicYearId: year._id,
      name: 'T2',
      startDate: new Date('2026-10-01'),
      endDate: new Date('2027-03-31'),
    },
  ]);
  const cls = await Class.create({ tenantId: tid, name: 'Grade 5', gradeLevel: 5 });
  const [a, b] = await Section.create([
    { tenantId: tid, classId: cls._id, name: 'A' },
    { tenantId: tid, classId: cls._id, name: 'B' },
  ]);
  const math = await Subject.create({
    tenantId: tid,
    name: 'Maths',
    code: `M${tid}`,
    classId: cls._id,
  });
  return { year, terms, a, b, math };
}

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

afterEach(async () => {
  const bypass = { _bypassTenantScope: true };
  await Promise.all(
    [AcademicYear, Term, Class, Section, Subject, SubjectTeacher, Timetable].map((m) =>
      m.deleteMany({}, bypass)
    )
  );
});

test('no active academic year gives an empty load with no year', async () => {
  await setup(tenantId, { active: false });
  expect(await loadTeachingLoad({ tenantId, teacherId })).toEqual({ yearId: null, items: [] });
});

test('a teacher with nothing assigned gets no rows', async () => {
  const { year } = await setup(tenantId);
  expect(await loadTeachingLoad({ tenantId, teacherId })).toEqual({
    yearId: String(year._id),
    items: [],
  });
});

test('merges an assignment in any term, timetable slots and the class-teacher section', async () => {
  const { year, terms, a, b, math } = await setup(tenantId);
  await SubjectTeacher.create({
    tenantId,
    termId: terms[1]._id,
    sectionId: a._id,
    subjectId: math._id,
    teacherId,
  });
  await Timetable.create({
    tenantId,
    academicYearId: year._id,
    sectionId: a._id,
    subjectId: math._id,
    teacherId,
    dayOfWeek: 1,
    periodNumber: 1,
    startTime: '09:00',
    endTime: '09:45',
  });
  await Section.updateOne({ _id: b._id, tenantId }, { $set: { classTeacherId: teacherId } });

  const { items } = await loadTeachingLoad({ tenantId, teacherId });

  expect(items.map((r) => [r.sectionLabel, r.subjectName, r.sources, r.periodsPerWeek])).toEqual([
    ['Grade 5 - A', 'Maths', ['assigned', 'timetable'], 1],
    ['Grade 5 - B', null, ['classTeacher'], 0],
  ]);
});

test('another teacher and another tenant never leak in', async () => {
  const mine = await setup(tenantId);
  const theirs = await setup(otherTenantId);
  await SubjectTeacher.create({
    tenantId,
    termId: mine.terms[0]._id,
    sectionId: mine.a._id,
    subjectId: mine.math._id,
    teacherId: otherTeacherId,
  });
  await SubjectTeacher.create({
    tenantId: otherTenantId,
    termId: theirs.terms[0]._id,
    sectionId: theirs.a._id,
    subjectId: theirs.math._id,
    teacherId,
  });

  expect((await loadTeachingLoad({ tenantId, teacherId })).items).toEqual([]);
});
