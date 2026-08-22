import { computeGradeStats } from '../utils/gradeStats.js';

const students = [
  { _id: 'a1', firstName: 'Ann', lastName: 'One', admissionNo: '001' },
  { _id: 'a2', firstName: 'Bob', lastName: 'Two', admissionNo: '002' },
  { _id: 'a3', firstName: 'Cal', lastName: 'Three', admissionNo: '003' },
];

test('single grade row per student is used as-is', () => {
  const grades = [
    { studentId: 'a1', score: 90, weightage: 1 },
    { studentId: 'a2', score: 60, weightage: 1 },
  ];

  const result = computeGradeStats(students, grades);
  const a1 = result.students.find((s) => s.studentId === 'a1');
  const a2 = result.students.find((s) => s.studentId === 'a2');

  expect(a1).toMatchObject({ score: 90, letterGrade: 'A' });
  expect(a2).toMatchObject({ score: 60, letterGrade: 'D' });
});

test('blends multiple assessment rows per student by weightage, matching reportCard.worker.js math', () => {
  const grades = [
    { studentId: 'a1', score: 100, weightage: 0.3 }, // quiz
    { studentId: 'a1', score: 80, weightage: 1 }, // final
  ];

  const result = computeGradeStats(students, grades);
  const a1 = result.students.find((s) => s.studentId === 'a1');

  // (100*0.3 + 80*1) / (0.3 + 1) = 110/1.3 = 84.615... -> rounded to 84.62
  expect(a1.score).toBeCloseTo(84.62, 2);
  expect(a1.letterGrade).toBe('B');
});

test('student with no grade rows has null score/letterGrade and is excluded from averages/rankings', () => {
  const result = computeGradeStats(students, [{ studentId: 'a1', score: 80, weightage: 1 }]);
  const a3 = result.students.find((s) => s.studentId === 'a3');

  expect(a3).toMatchObject({ score: null, letterGrade: null });
  expect(result.topPerformers.some((s) => s.studentId === 'a3')).toBe(false);
});

test('classAverageScore averages per-student blended scores, not raw grade rows', () => {
  const grades = [
    { studentId: 'a1', score: 100, weightage: 1 },
    { studentId: 'a2', score: 50, weightage: 1 },
  ];

  const result = computeGradeStats(students, grades);
  expect(result.classAverageScore).toBe(75);
});

test('distribution counts letter grades derived from the blended score', () => {
  const grades = [
    { studentId: 'a1', score: 95, weightage: 1 },
    { studentId: 'a2', score: 95, weightage: 1 },
    { studentId: 'a3', score: 55, weightage: 1 },
  ];

  const result = computeGradeStats(students, grades);
  expect(result.distribution).toMatchObject({ A: 2, F: 1 });
});

test('top/bottom performers are ranked descending/ascending by score', () => {
  const grades = [
    { studentId: 'a1', score: 70, weightage: 1 },
    { studentId: 'a2', score: 95, weightage: 1 },
    { studentId: 'a3', score: 40, weightage: 1 },
  ];

  const result = computeGradeStats(students, grades);
  expect(result.topPerformers.map((s) => s.studentId)).toEqual(['a2', 'a1', 'a3']);
  expect(result.bottomPerformers.map((s) => s.studentId)).toEqual(['a3', 'a1', 'a2']);
});

test('matches ObjectId-like studentId by string equality', () => {
  const objIdStudents = [{ _id: { toString: () => 'a1' }, firstName: 'Ann' }];
  const grades = [{ studentId: { toString: () => 'a1' }, score: 88, weightage: 1 }];

  const result = computeGradeStats(objIdStudents, grades);
  expect(result.students[0]).toMatchObject({ score: 88, letterGrade: 'B' });
});
