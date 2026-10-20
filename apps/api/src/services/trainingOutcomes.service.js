import { isModuleEnabled } from '@rooted/shared/utils';
import { Tenant } from '../models/Tenant.js';
import { Student } from '../models/Student.js';
import { Enrollment } from '../models/Enrollment.js';
import { AttendanceRecord } from '../models/AttendanceRecord.js';
import { Grade } from '../models/Grade.js';
import { PlacementApplication } from '../models/PlacementApplication.js';
import {
  attendancePercent,
  computeImprovement,
  countPlacementStages,
} from '../utils/trainingMetrics.js';

const BYPASS = { _bypassTenantScope: true };
const pct = (n, d) => (d > 0 ? Math.round((n / d) * 1000) / 10 : null);

const countsByKey = (rows) => Object.fromEntries(rows.map(({ _id, n }) => [_id, n]));

/**
 * Per-college training outcomes for the Rural Root Cloud super admin.
 *
 * This is the one place that reads across tenants, so it is deliberately
 * narrow: counts and percentages only. It selects no student name, admission
 * number, contact detail or placement employer — nothing here can identify a
 * person even if a response is logged or screenshotted.
 */
export async function getOutcomes() {
  const tenants = (await Tenant.find({ status: 'active' }, 'name orgType enabledModules').lean())
    .filter((t) => isModuleEnabled(t, 'training'))
    .sort((a, b) => a.name.localeCompare(b.name));

  const colleges = [];
  for (const tenant of tenants) {
    const tenantId = tenant._id;
    const [activeStudents, enrollments, attendanceRows, grades, placements] = await Promise.all([
      Student.find({ tenantId, status: 'active' }, '_id').lean(),
      Enrollment.find({ tenantId }, 'studentId status').lean(),
      AttendanceRecord.aggregate([
        { $match: { tenantId, entityType: 'student' } },
        { $group: { _id: '$status', n: { $sum: 1 } } },
      ]),
      Grade.find(
        { tenantId, assessmentType: { $in: ['baseline', 'final'] } },
        'studentId subjectId termId assessmentType score',
        BYPASS
      ).lean(),
      PlacementApplication.find(
        { tenantId },
        'studentId stage appliedAt interviewedAt offeredAt joinedAt',
        BYPASS
      ).lean(),
    ]);

    // Per student, not per enrolment row: someone who completed two batches is one
    // completion, and a student who has since graduated is no longer in `enrolled`,
    // so counting their old rows would push the rate past 100%.
    const enrolled = activeStudents.length;
    const activeIds = new Set(activeStudents.map((st) => String(st._id)));
    const statusesByStudent = new Map();
    for (const { studentId, status } of enrollments) {
      const id = String(studentId);
      if (!activeIds.has(id)) continue;
      statusesByStudent.set(id, (statusesByStudent.get(id) ?? new Set()).add(status));
    }
    const completed = [...statusesByStudent.values()].filter((st) => st.has('completed')).length;
    const dropped = [...statusesByStudent.values()].filter(
      (st) => st.has('dropped') && !st.has('completed')
    ).length;
    const improvement = computeImprovement(grades);
    colleges.push({
      tenantId: String(tenantId),
      name: tenant.name,
      enrolled,
      completed,
      dropped,
      completionPct: pct(completed, enrolled),
      attendancePct: attendancePercent(countsByKey(attendanceRows)),
      avgDelta: improvement.avgDelta,
      studentsMeasured: improvement.studentsMeasured,
      placement: countPlacementStages(placements),
    });
  }

  const sum = (pick) => colleges.reduce((total, c) => total + pick(c), 0);
  return {
    colleges,
    totals: {
      colleges: colleges.length,
      enrolled: sum((c) => c.enrolled),
      completed: sum((c) => c.completed),
      joined: sum((c) => c.placement.joined),
    },
  };
}
