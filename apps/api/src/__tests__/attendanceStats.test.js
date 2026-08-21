import { computeAttendanceStats } from '../utils/attendanceStats.js';

const students = [
  { _id: 'a1', firstName: 'Ann', lastName: 'One' },
  { _id: 'a2', firstName: 'Bob', lastName: 'Two' },
  { _id: 'a3', firstName: 'Cal', lastName: 'Three' },
];

test('computes period-level present/total/pct per student', () => {
  const records = [
    { entityId: 'a1', status: 'present' },
    { entityId: 'a1', status: 'present' },
    { entityId: 'a1', status: 'absent' },
    { entityId: 'a1', status: 'absent' },
    { entityId: 'a2', status: 'present' },
    { entityId: 'a2', status: 'late' },
  ];

  const result = computeAttendanceStats(students, records, 75);
  const a1 = result.students.find((s) => s.studentId === 'a1');
  const a2 = result.students.find((s) => s.studentId === 'a2');

  expect(a1).toMatchObject({ presentCount: 2, totalCount: 4, pct: 50, isDefaulter: true });
  // 'late' counts as present, matching the student-detail summary convention.
  expect(a2).toMatchObject({ presentCount: 2, totalCount: 2, pct: 100, isDefaulter: false });
});

test('student with no records has null pct and is never a defaulter', () => {
  const result = computeAttendanceStats(students, [], 75);
  const a3 = result.students.find((s) => s.studentId === 'a3');

  expect(a3).toMatchObject({ presentCount: 0, totalCount: 0, pct: null, isDefaulter: false });
});

test('pct exactly at threshold is not a defaulter (strict less-than)', () => {
  const records = [
    { entityId: 'a1', status: 'present' },
    { entityId: 'a1', status: 'present' },
    { entityId: 'a1', status: 'present' },
    { entityId: 'a1', status: 'absent' },
  ];

  const result = computeAttendanceStats(students, records, 75);
  const a1 = result.students.find((s) => s.studentId === 'a1');

  expect(a1).toMatchObject({ pct: 75, isDefaulter: false });
});

test('classAveragePct is period-level across all students, not an average of per-student pct', () => {
  const records = [
    // a1: 1/4 present (skews low with few records)
    { entityId: 'a1', status: 'present' },
    { entityId: 'a1', status: 'absent' },
    { entityId: 'a1', status: 'absent' },
    { entityId: 'a1', status: 'absent' },
    // a2: 18/20 present (many records, near-perfect)
    ...Array.from({ length: 18 }, () => ({ entityId: 'a2', status: 'present' })),
    ...Array.from({ length: 2 }, () => ({ entityId: 'a2', status: 'absent' })),
  ];

  const result = computeAttendanceStats(students, records, 75);
  // (1 + 18) / (4 + 20) = 79.16...% -> rounded 79, not the naive per-student average (~44%)
  expect(result.classAveragePct).toBe(79);
});

test('matches ObjectId-like entityId/studentId by string equality', () => {
  const objIdStudents = [{ _id: { toString: () => 'a1' } }];
  const records = [{ entityId: { toString: () => 'a1' }, status: 'present' }];

  const result = computeAttendanceStats(objIdStudents, records, 75);
  expect(result.students[0]).toMatchObject({ presentCount: 1, totalCount: 1, pct: 100 });
});
