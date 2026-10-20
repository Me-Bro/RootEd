import {
  computeBatch,
  attendancePercent,
  computeImprovement,
  countPlacementStages,
} from '../utils/trainingMetrics.js';
import { TRAINING_TARGETS, READINESS_WEIGHTS } from '@rooted/shared/constants';

// Five students, every figure worked out by hand.
//   A completed   B completed   C active   D dropped   E active
// Non-dropped students: A, B, C, E (4). Everyone: 5.
const [A, B, C, D, E] = ['a', 'b', 'c', 'd', 'e'];

const members = [
  { studentId: A, status: 'completed' },
  { studentId: B, status: 'completed' },
  { studentId: C, status: 'active' },
  { studentId: D, status: 'dropped' },
  { studentId: E, status: 'active' },
];

const rec = (entityId, status, n) => Array.from({ length: n }, () => ({ entityId, status }));

// Attendance: late counts as present, excused is left out of the maths.
//   A: 7 present + 1 late + 2 absent (+1 excused) → 8/10 = 80%
//   B: 10 present                                 → 100%
//   C: 5 present + 5 absent                       → 50%
//   D: 3 present + 7 absent (dropped, ignored by the batch figure)
//   E: nothing recorded                           → null (not 0)
// Batch: (8 + 10 + 5) / (10 + 10 + 10) = 23/30 = 76.7%
const attendance = [
  ...rec(A, 'present', 7),
  ...rec(A, 'late', 1),
  ...rec(A, 'absent', 2),
  ...rec(A, 'excused', 1),
  ...rec(B, 'present', 10),
  ...rec(C, 'present', 5),
  ...rec(C, 'absent', 5),
  ...rec(D, 'present', 3),
  ...rec(D, 'absent', 7),
];

// Grades (two subjects, s1 and s2).
//   baseline: A s1 40 s2 50 | B s1 60 | C s1 30
//   final:    A s1 70 s2 80 | B s1 90 | C s1 50 | E s1 60 (no baseline)
//   mock:     A 80 | B 60
// Per-student delta: A (30+30)/2 = 30, B 30, C 20, E none → batch 80/3 = 26.7
const g = (studentId, subjectId, assessmentType, score) => ({
  studentId,
  subjectId,
  assessmentType,
  score,
});
const grades = [
  g(A, 's1', 'baseline', 40),
  g(A, 's2', 'baseline', 50),
  g(B, 's1', 'baseline', 60),
  g(C, 's1', 'baseline', 30),
  g(A, 's1', 'final', 70),
  g(A, 's2', 'final', 80),
  g(B, 's1', 'final', 90),
  g(C, 's1', 'final', 50),
  g(E, 's1', 'final', 60),
  g(A, 's3', 'mock_interview', 80),
  g(B, 's3', 'mock_interview', 60),
];

// Two assignments of 10 marks each (20 in total).
//   A reviewed 8 + 6 → 14/20 = 70%
//   B reviewed 10, second only submitted → 10/20 = 50%
//   C, E nothing recorded → 0%
const assignments = [
  { _id: 'x1', maxScore: 10 },
  { _id: 'x2', maxScore: 10 },
];
const submissions = [
  { assignmentId: 'x1', studentId: A, status: 'reviewed', score: 8 },
  { assignmentId: 'x2', studentId: A, status: 'reviewed', score: 6 },
  { assignmentId: 'x1', studentId: B, status: 'reviewed', score: 10 },
  { assignmentId: 'x2', studentId: B, status: 'submitted', score: null },
];

// Projects: team 1 (A, B, C) reviewed 82; team 2 (E) not reviewed yet.
// Project completion: A, B, C of the 4 non-dropped = 75%.
const projects = [
  { memberIds: [A, B, C], reviewScore: 82 },
  { memberIds: [E], reviewScore: null },
];

// Placement, unique students per stage reached:
//   applied: A B C D E (5) | interviewed: A B C (3) | offered: A B (2)
//   joined: A (1) | rejected: E (1)
const d = (s) => new Date(s);
const placements = [
  {
    studentId: A,
    stage: 'joined',
    appliedAt: d('2026-08-01'),
    interviewedAt: d('2026-08-10'),
    offeredAt: d('2026-08-20'),
    joinedAt: d('2026-09-05'),
  },
  {
    studentId: B,
    stage: 'offered',
    appliedAt: d('2026-08-02'),
    interviewedAt: d('2026-08-12'),
    offeredAt: d('2026-08-25'),
  },
  {
    studentId: C,
    stage: 'interviewed',
    appliedAt: d('2026-08-03'),
    interviewedAt: d('2026-08-14'),
  },
  { studentId: D, stage: 'applied', appliedAt: d('2026-08-04') },
  { studentId: E, stage: 'rejected', appliedAt: d('2026-08-05'), closedAt: d('2026-08-18') },
];

const input = { members, attendance, grades, assignments, submissions, projects, placements };
const { metrics, rows } = computeBatch(input);
const row = (id) => rows.find((r) => r.studentId === id);

describe('batch metrics (R8)', () => {
  test('attendance is pooled over non-dropped students, late counts, excused does not', () => {
    expect(metrics.attendance.pct).toBeCloseTo(76.7, 1);
    expect(metrics.attendance.target).toBe(TRAINING_TARGETS.attendance);
    expect(metrics.attendance.met).toBe(false);
    expect(metrics.attendance.studentsBelowTarget).toBe(1); // C; E has no data, not "below"
  });

  test('completion is the admin decision over everyone enrolled, dropped included', () => {
    expect(metrics.completion).toMatchObject({ completed: 2, enrolled: 5, dropped: 1 });
    expect(metrics.completion.pct).toBe(40);
    expect(metrics.completion.target).toBe(TRAINING_TARGETS.completion);
    expect(metrics.completion.met).toBe(false);
  });

  test('project completion counts members of a reviewed project over non-dropped students', () => {
    expect(metrics.project).toMatchObject({ completed: 3, eligible: 4, pct: 75, met: false });
  });

  test('mock interview completion is students with a mock score over non-dropped students', () => {
    expect(metrics.mockInterview).toMatchObject({ completed: 2, eligible: 4, pct: 50, met: false });
  });

  test('pre/post improvement averages per-student deltas and skips students with no baseline', () => {
    expect(metrics.improvement.studentsMeasured).toBe(3);
    expect(metrics.improvement.avgDelta).toBeCloseTo(26.7, 1);
  });

  test('placement counts are unique students per stage, reported separately', () => {
    expect(metrics.placement).toMatchObject({
      applied: 5,
      interviewed: 3,
      offered: 2,
      joined: 1,
      rejected: 1,
    });
  });

  test('enrolment figures', () => {
    expect(metrics.enrolled).toBe(5);
    expect(metrics.active).toBe(4);
  });
});

describe('per-student rows', () => {
  test('attendance percent, with null (not 0) when nothing is recorded (EH1)', () => {
    expect(row(A).attendancePct).toBe(80);
    expect(row(B).attendancePct).toBe(100);
    expect(row(C).attendancePct).toBe(50);
    expect(row(E).attendancePct).toBeNull();
  });

  test('assignment percent is reviewed marks over all marks on offer', () => {
    expect(row(A).assignmentsPct).toBe(70);
    expect(row(B).assignmentsPct).toBe(50);
    expect(row(C).assignmentsPct).toBe(0);
  });

  test('delta is null when there is no baseline (EH2)', () => {
    expect(row(A).delta).toBe(30);
    expect(row(C).delta).toBe(20);
    expect(row(E).delta).toBeNull();
    expect(row(E).finalAvg).toBe(60);
  });

  test('project and mock scores come through', () => {
    expect(row(A).projectScore).toBe(82);
    expect(row(E).projectScore).toBeNull();
    expect(row(A).mockScore).toBe(80);
    expect(row(C).mockScore).toBeNull();
  });

  test('furthest placement stage, and the decision status', () => {
    expect(row(A).placementStage).toBe('joined');
    expect(row(B).placementStage).toBe('offered');
    expect(row(E).placementStage).toBe('rejected');
    expect(row(A).status).toBe('completed');
    expect(row(D).status).toBe('dropped');
  });
});

describe('readiness (provisional, R9)', () => {
  test('is flagged provisional and carries the weights it used', () => {
    expect(row(A).readiness.provisional).toBe(true);
    expect(row(A).readiness.weights).toEqual(READINESS_WEIGHTS);
  });

  test('weights the five components', () => {
    // (80*20 + 70*20 + 75*25 + 82*20 + 80*15) / 100 = 77.15
    expect(row(A).readiness.score).toBeCloseTo(77.2, 1);
  });

  test('a missing component is renormalised away, not read as zero', () => {
    // E has only assignments (0) and a final (60): (0*20 + 60*25) / 45 = 33.3
    expect(row(E).readiness.score).toBeCloseTo(33.3, 1);
    expect(row(E).readiness.components.mockInterview).toBeNull();
  });

  test('a student with nothing recorded has a null score, not 0', () => {
    const empty = computeBatch({
      ...input,
      members: [{ studentId: 'z', status: 'active' }],
      assignments: [],
      projects: [],
    });
    expect(empty.rows[0].readiness.score).toBeNull();
  });
});

describe('edge cases', () => {
  test('an empty batch gives zeros and nulls, never NaN (EH6)', () => {
    const { metrics: m, rows: r } = computeBatch({
      members: [],
      attendance: [],
      grades: [],
      assignments: [],
      submissions: [],
      projects: [],
      placements: [],
    });
    expect(r).toEqual([]);
    expect(m.enrolled).toBe(0);
    expect(m.completion.pct).toBeNull();
    expect(m.attendance.pct).toBeNull();
    expect(m.project.pct).toBeNull();
    expect(m.mockInterview.pct).toBeNull();
    expect(m.improvement.avgDelta).toBeNull();
    expect(JSON.stringify(m)).not.toMatch(/NaN/);
  });

  test('a batch where everyone dropped has no eligible students', () => {
    const { metrics: m } = computeBatch({
      ...input,
      members: members.map((x) => ({ ...x, status: 'dropped' })),
    });
    expect(m.active).toBe(0);
    expect(m.project.pct).toBeNull();
    expect(m.completion.pct).toBe(0);
  });

  test('a met target is flagged (>= is a pass)', () => {
    const { metrics: m } = computeBatch({
      members: [{ studentId: A, status: 'completed' }],
      attendance: rec(A, 'present', 8).concat(rec(A, 'absent', 2)),
      grades: [],
      assignments: [],
      submissions: [],
      projects: [],
      placements: [],
    });
    expect(m.attendance.pct).toBe(80);
    expect(m.attendance.met).toBe(true);
    expect(m.completion.met).toBe(true);
  });
});

describe('helpers used by the cross-college view', () => {
  test('attendancePercent', () => {
    expect(attendancePercent({ present: 7, late: 1, absent: 2, excused: 1 })).toBe(80);
    expect(attendancePercent({ present: 0, late: 0, absent: 0, excused: 4 })).toBeNull();
  });

  test('computeImprovement', () => {
    expect(computeImprovement(grades).avgDelta).toBeCloseTo(26.7, 1);
    expect(computeImprovement([]).avgDelta).toBeNull();
  });

  test('countPlacementStages', () => {
    expect(countPlacementStages(placements)).toEqual({
      applied: 5,
      interviewed: 3,
      offered: 2,
      joined: 1,
      rejected: 1,
    });
  });
});
