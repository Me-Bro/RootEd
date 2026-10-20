import { TRAINING_TARGETS, READINESS_WEIGHTS } from '@rooted/shared/constants';

/**
 * Batch metrics and per-student rows for the training module.
 *
 * Pure: every function takes plain arrays and returns plain data, so each
 * figure can be checked by hand without a database. The service layer
 * (services/trainingMetrics.service.js) loads the arrays.
 *
 * A figure with nothing to measure is `null`, never 0 and never NaN: "no
 * attendance recorded" must not read as "0% attendance".
 */

const round1 = (n) => Math.round(n * 10) / 10;
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const pct = (n, d) => (d > 0 ? round1((n / d) * 100) : null);
const meets = (value, target) => (value === null ? false : value >= target);

const PROGRESSION = ['applied', 'interviewed', 'offered', 'joined'];

// Late counts as present; excused is left out of the maths entirely.
export function attendancePercent({ present = 0, late = 0, absent = 0 }) {
  return pct(present + late, present + late + absent);
}

function attendanceCounts(records) {
  const byStudent = new Map();
  for (const { entityId, status } of records) {
    const counts = byStudent.get(String(entityId)) ?? {
      present: 0,
      late: 0,
      absent: 0,
      excused: 0,
    };
    if (status in counts) counts[status] += 1;
    byStudent.set(String(entityId), counts);
  }
  return byStudent;
}

const group = (items, keyOf) => {
  const map = new Map();
  for (const item of items) {
    const key = String(keyOf(item));
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(item);
  }
  return map;
};

/**
 * Pre/post improvement: for each student, the mean of (final − baseline) over
 * the subject-and-term pairs that have both. A baseline is only ever compared
 * with the final of the same term; a student with no baseline is not measured.
 */
export function computeImprovement(grades) {
  const deltaByStudent = new Map();
  for (const [studentId, rows] of group(grades, (g) => g.studentId)) {
    const bySubjectAndTerm = group(rows, (g) => `${g.subjectId}|${g.termId ?? ''}`);
    const deltas = [];
    for (const subjectRows of bySubjectAndTerm.values()) {
      const baseline = subjectRows.find((g) => g.assessmentType === 'baseline');
      const final = subjectRows.find((g) => g.assessmentType === 'final');
      if (baseline && final) deltas.push(final.score - baseline.score);
    }
    if (deltas.length) deltaByStudent.set(studentId, mean(deltas));
  }
  const all = [...deltaByStudent.values()];
  return {
    avgDelta: all.length ? round1(mean(all)) : null,
    studentsMeasured: all.length,
    deltaByStudent,
  };
}

const reachedStage = (placements, field) =>
  new Set(placements.filter((p) => p[field]).map((p) => String(p.studentId))).size;

/** Unique students who reached each stage. Each stage is reported on its own. */
export function countPlacementStages(placements) {
  return {
    applied: reachedStage(placements, 'appliedAt'),
    interviewed: reachedStage(placements, 'interviewedAt'),
    offered: reachedStage(placements, 'offeredAt'),
    joined: reachedStage(placements, 'joinedAt'),
    rejected: new Set(
      placements.filter((p) => p.stage === 'rejected').map((p) => String(p.studentId))
    ).size,
  };
}

function furthestStage(applications) {
  if (!applications.length) return null;
  const progressed = applications.map((a) => PROGRESSION.indexOf(a.stage)).filter((i) => i !== -1);
  if (progressed.length) return PROGRESSION[Math.max(...progressed)];
  return applications[0].stage; // only closed applications: rejected / withdrawn
}

function computeReadiness(components, weights) {
  let weighted = 0;
  let total = 0;
  for (const [key, value] of Object.entries(components)) {
    if (value === null || value === undefined) continue;
    weighted += value * weights[key];
    total += weights[key];
  }
  return {
    score: total > 0 ? round1(weighted / total) : null,
    components,
    weights,
    provisional: true,
  };
}

export function computeBatch({
  members,
  attendance,
  grades,
  assignments,
  submissions,
  projects,
  placements,
  weights = READINESS_WEIGHTS,
  targets = TRAINING_TARGETS,
}) {
  const attendanceByStudent = attendanceCounts(attendance);
  const gradesByStudent = group(grades, (g) => g.studentId);
  const submissionsByStudent = group(submissions, (s) => s.studentId);
  const placementsByStudent = group(placements, (p) => p.studentId);
  const improvement = computeImprovement(grades);

  const assignmentIds = new Set(assignments.map((a) => String(a._id)));
  const totalMarks = assignments.reduce((sum, a) => sum + a.maxScore, 0);

  const rows = members.map(({ studentId, status }) => {
    const id = String(studentId);
    const counts = attendanceByStudent.get(id);
    const own = gradesByStudent.get(id) ?? [];
    const scoresOf = (type) => own.filter((g) => g.assessmentType === type).map((g) => g.score);
    const finalScores = scoresOf('final');
    const mockScores = scoresOf('mock_interview');

    const earned = (submissionsByStudent.get(id) ?? [])
      .filter((s) => assignmentIds.has(String(s.assignmentId)))
      .filter((s) => s.status === 'reviewed' && s.score !== null && s.score !== undefined)
      .reduce((sum, s) => sum + s.score, 0);

    const reviewed = projects
      .filter((p) => p.memberIds.map(String).includes(id))
      .filter((p) => p.reviewScore !== null && p.reviewScore !== undefined)
      .map((p) => p.reviewScore);

    const attendancePct = counts ? attendancePercent(counts) : null;
    const assignmentsPct = totalMarks > 0 ? pct(earned, totalMarks) : null;
    const finalAvg = finalScores.length ? round1(mean(finalScores)) : null;
    const projectScore = reviewed.length ? round1(mean(reviewed)) : null;
    const mockScore = mockScores.length ? round1(mean(mockScores)) : null;
    const delta = improvement.deltaByStudent.has(id)
      ? round1(improvement.deltaByStudent.get(id))
      : null;

    return {
      studentId: id,
      status,
      attendancePct,
      assignmentsPct,
      finalAvg,
      delta,
      projectScore,
      mockScore,
      placementStage: furthestStage(placementsByStudent.get(id) ?? []),
      readiness: computeReadiness(
        {
          attendance: attendancePct,
          assignments: assignmentsPct,
          finalGrade: finalAvg,
          project: projectScore,
          mockInterview: mockScore,
        },
        weights
      ),
    };
  });

  // Dropped students count against completion but are not "eligible" for the
  // other targets: they left, so they can neither attend nor present.
  const eligible = rows.filter((r) => r.status !== 'dropped');
  const eligibleIds = new Set(eligible.map((r) => r.studentId));

  const pooled = { present: 0, late: 0, absent: 0 };
  for (const id of eligibleIds) {
    const c = attendanceByStudent.get(id);
    if (!c) continue;
    pooled.present += c.present;
    pooled.late += c.late;
    pooled.absent += c.absent;
  }
  const attendancePct = attendancePercent(pooled);

  const completed = rows.filter((r) => r.status === 'completed').length;
  const projectDone = eligible.filter((r) => r.projectScore !== null).length;
  const mockDone = eligible.filter((r) => r.mockScore !== null).length;
  const completionPct = pct(completed, rows.length);
  const projectPct = pct(projectDone, eligible.length);
  const mockPct = pct(mockDone, eligible.length);

  const eligibleDeltas = improvement.deltaByStudent;
  const measured = [...eligibleDeltas.entries()].filter(([id]) => eligibleIds.has(id));

  return {
    metrics: {
      enrolled: rows.length,
      active: eligible.length,
      attendance: {
        pct: attendancePct,
        target: targets.attendance,
        met: meets(attendancePct, targets.attendance),
        studentsBelowTarget: eligible.filter(
          (r) => r.attendancePct !== null && r.attendancePct < targets.attendance
        ).length,
      },
      completion: {
        completed,
        enrolled: rows.length,
        dropped: rows.filter((r) => r.status === 'dropped').length,
        pct: completionPct,
        target: targets.completion,
        met: meets(completionPct, targets.completion),
      },
      project: {
        completed: projectDone,
        eligible: eligible.length,
        pct: projectPct,
        target: targets.project,
        met: meets(projectPct, targets.project),
      },
      mockInterview: {
        completed: mockDone,
        eligible: eligible.length,
        pct: mockPct,
        target: targets.mockInterview,
        met: meets(mockPct, targets.mockInterview),
      },
      improvement: {
        avgDelta: measured.length ? round1(mean(measured.map(([, delta]) => delta))) : null,
        studentsMeasured: measured.length,
      },
      placement: countPlacementStages(placements),
    },
    rows,
  };
}
