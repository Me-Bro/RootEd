import { Term } from '../models/Term.js';
import { AttendanceRecord } from '../models/AttendanceRecord.js';
import { Grade } from '../models/Grade.js';
import { Assignment } from '../models/Assignment.js';
import { Submission } from '../models/Submission.js';
import { Project } from '../models/Project.js';
import { PlacementApplication } from '../models/PlacementApplication.js';
import { AppError } from '../middleware/errorHandler.js';
import { assertRefs, getBatchEnrollments } from './training.service.js';
import { computeBatch } from '../utils/trainingMetrics.js';

const GRADE_FIELDS = 'studentId subjectId assessmentType score';
const TRAINING_GRADE_TYPES = ['baseline', 'final', 'mock_interview'];

/**
 * The batch's metrics and per-student rows for one programme run.
 *
 * Staff-facing: it sees every grade and every submission, published or not —
 * students get a filtered view of their own through /me/progress instead.
 * Attendance is limited to the term's own date range, since a batch is
 * measured over its run.
 */
export async function getBatchMetrics(tenantId, { sectionId, termId }) {
  await assertRefs(tenantId, { sectionId });
  const term = await Term.findOne({ _id: termId, tenantId }).lean();
  if (!term) throw new AppError('Term not found', 404);

  const batch = await getBatchEnrollments(tenantId, sectionId);
  const studentIds = batch.map((b) => b.student._id);

  const [attendance, grades, assignments, projects, placements] = await Promise.all([
    AttendanceRecord.find(
      {
        tenantId,
        entityType: 'student',
        entityId: { $in: studentIds },
        sectionId,
        date: { $gte: term.startDate, $lte: term.endDate },
      },
      'entityId status'
    ).lean(),
    Grade.find(
      {
        tenantId,
        termId,
        studentId: { $in: studentIds },
        assessmentType: { $in: TRAINING_GRADE_TYPES },
      },
      GRADE_FIELDS
    ).lean(),
    Assignment.find({ tenantId, sectionId, termId }, 'maxScore').lean(),
    Project.find({ tenantId, sectionId, termId }, 'memberIds reviewScore').lean(),
    PlacementApplication.find({ tenantId, studentId: { $in: studentIds } }).lean(),
  ]);
  const submissions = await Submission.find(
    { tenantId, assignmentId: { $in: assignments.map((a) => a._id) } },
    'assignmentId studentId status score'
  ).lean();

  const { metrics, rows } = computeBatch({
    members: batch.map((b) => ({ studentId: b.student._id, status: b.status })),
    attendance,
    grades,
    assignments,
    submissions,
    projects,
    placements,
  });

  const studentById = new Map(batch.map((b) => [String(b.student._id), b.student]));
  return {
    term: { _id: term._id, name: term.name, startDate: term.startDate, endDate: term.endDate },
    metrics,
    rows: rows.map((row) => {
      const { firstName, lastName, admissionNo } = studentById.get(row.studentId);
      return { ...row, student: { _id: row.studentId, firstName, lastName, admissionNo } };
    }),
  };
}
