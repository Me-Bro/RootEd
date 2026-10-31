import { buildTeachingLoad } from '../utils/teachingLoad.js';

const classes = [
  { _id: 'c5', name: 'Grade 5', gradeLevel: 5 },
  { _id: 'c6', name: 'Grade 6', gradeLevel: 6 },
];
const sections = [
  { _id: 's5a', classId: 'c5', name: 'A' },
  { _id: 's5b', classId: 'c5', name: 'B' },
  { _id: 's6a', classId: 'c6', name: 'A' },
];
const subjects = [
  { _id: 'math', name: 'Maths' },
  { _id: 'eng', name: 'English' },
];
const ctx = { sections, classes, subjects };

test('the same section and subject from an assignment and a timetable slot is one row with both sources', () => {
  const rows = buildTeachingLoad({
    assignments: [{ sectionId: 's5a', subjectId: 'math' }],
    slots: [
      { sectionId: 's5a', subjectId: 'math' },
      { sectionId: 's5a', subjectId: 'math' },
    ],
    classTeacherSectionIds: [],
    ...ctx,
  });

  expect(rows).toEqual([
    {
      sectionId: 's5a',
      classId: 'c5',
      sectionLabel: 'Grade 5 - A',
      subjectId: 'math',
      subjectName: 'Maths',
      sources: ['assigned', 'timetable'],
      periodsPerWeek: 2,
    },
  ]);
});

test('an assignment in two terms of the year is still one row', () => {
  const rows = buildTeachingLoad({
    assignments: [
      { sectionId: 's5a', subjectId: 'math' },
      { sectionId: 's5a', subjectId: 'math' },
    ],
    slots: [],
    classTeacherSectionIds: [],
    ...ctx,
  });
  expect(rows).toHaveLength(1);
  expect(rows[0].periodsPerWeek).toBe(0);
});

test('a class-teacher section with no subject gets one row without a subject', () => {
  const rows = buildTeachingLoad({
    assignments: [],
    slots: [],
    classTeacherSectionIds: ['s5b'],
    ...ctx,
  });
  expect(rows).toEqual([
    {
      sectionId: 's5b',
      classId: 'c5',
      sectionLabel: 'Grade 5 - B',
      subjectId: null,
      subjectName: null,
      sources: ['classTeacher'],
      periodsPerWeek: 0,
    },
  ]);
});

test('a class teacher who also teaches the section keeps the subject row and gains the class-teacher source on a subject-less row', () => {
  const rows = buildTeachingLoad({
    assignments: [{ sectionId: 's5a', subjectId: 'eng' }],
    slots: [],
    classTeacherSectionIds: ['s5a'],
    ...ctx,
  });
  expect(rows.map((r) => [r.subjectId, r.sources])).toEqual([
    ['eng', ['assigned']],
    [null, ['classTeacher']],
  ]);
});

test('a deleted subject or section is dropped', () => {
  const rows = buildTeachingLoad({
    assignments: [
      { sectionId: 's5a', subjectId: 'gone' },
      { sectionId: 'gone', subjectId: 'math' },
    ],
    slots: [],
    classTeacherSectionIds: ['gone'],
    ...ctx,
  });
  expect(rows).toEqual([]);
});

test('rows sort by grade level, then section, then subject name', () => {
  const rows = buildTeachingLoad({
    assignments: [
      { sectionId: 's6a', subjectId: 'math' },
      { sectionId: 's5b', subjectId: 'math' },
      { sectionId: 's5a', subjectId: 'math' },
      { sectionId: 's5a', subjectId: 'eng' },
    ],
    slots: [],
    classTeacherSectionIds: [],
    ...ctx,
  });
  expect(rows.map((r) => `${r.sectionLabel}/${r.subjectName}`)).toEqual([
    'Grade 5 - A/English',
    'Grade 5 - A/Maths',
    'Grade 5 - B/Maths',
    'Grade 6 - A/Maths',
  ]);
});

test('no input gives no rows', () => {
  expect(
    buildTeachingLoad({ assignments: [], slots: [], classTeacherSectionIds: [], ...ctx })
  ).toEqual([]);
});
