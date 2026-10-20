import { Term } from '../models/Term.js';
import { AttendanceRecord } from '../models/AttendanceRecord.js';
import { Grade } from '../models/Grade.js';
import { GradeLock } from '../models/GradeLock.js';
import { Subject } from '../models/Subject.js';
import { Assignment } from '../models/Assignment.js';
import { Submission } from '../models/Submission.js';
import { Project } from '../models/Project.js';
import { PlacementApplication } from '../models/PlacementApplication.js';
import { Employer } from '../models/Employer.js';
import { Enrollment } from '../models/Enrollment.js';
import { AppError } from '../middleware/errorHandler.js';
import { computeBatch, attendancePercent } from '../utils/trainingMetrics.js';

const TRAINING_GRADE_TYPES = ['baseline', 'final', 'mock_interview'];

/**
 * One student's own progress, for GET /me/progress.
 *
 * The caller supplies who the student is (from the access token, never the
 * request), and everything here is filtered to what that student may see:
 * grades only once published (a GradeLock exists), assignment scores only once
 * reviewed. The same pure functions as the staff view produce the figures, so
 * a student and their trainer never see two different numbers.
 */
export async function getStudentProgress(tenantId, { studentId, sectionId, termId }) {
  const term = termId
    ? await Term.findOne({ _id: termId, tenantId }).lean()
    : await Term.findOne({ tenantId }).sort({ startDate: -1 }).lean();
  if (termId && !term) throw new AppError('Term not found', 404);
  if (!term) return { term: null };

  const inBatch = Boolean(sectionId);
  const [records, grades, locks, assignments, project, placements, enrollment] = await Promise.all([
    inBatch
      ? AttendanceRecord.find(
          {
            tenantId,
            entityType: 'student',
            entityId: studentId,
            sectionId,
            date: { $gte: term.startDate, $lte: term.endDate },
          },
          'entityId status'
        ).lean()
      : [],
    Grade.find({
      tenantId,
      studentId,
      termId: term._id,
      assessmentType: { $in: TRAINING_GRADE_TYPES },
    }).lean(),
    inBatch ? GradeLock.find({ tenantId, sectionId, termId: term._id }).lean() : [],
    inBatch
      ? Assignment.find({ tenantId, sectionId, termId: term._id }).sort({ dueDate: 1 }).lean()
      : [],
    inBatch
      ? Project.findOne({ tenantId, sectionId, termId: term._id, memberIds: studentId }).lean()
      : null,
    PlacementApplication.find({ tenantId, studentId }).sort({ appliedAt: 1 }).lean(),
    inBatch ? Enrollment.findOne({ tenantId, studentId, sectionId }).lean() : null,
  ]);

  const published = new Set(
    locks.map((l) => `${l.sectionId}:${l.subjectId}:${l.termId}:${l.assessmentType}`)
  );
  const visibleGrades = grades.filter((g) =>
    published.has(`${g.sectionId}:${g.subjectId}:${g.termId}:${g.assessmentType}`)
  );

  const submissions = assignments.length
    ? await Submission.find({
        tenantId,
        studentId,
        assignmentId: { $in: assignments.map((a) => a._id) },
      }).lean()
    : [];
  const submissionFor = new Map(submissions.map((s) => [String(s.assignmentId), s]));

  const [subjects, employers] = await Promise.all([
    Subject.find(
      { tenantId, _id: { $in: [...new Set(visibleGrades.map((g) => String(g.subjectId)))] } },
      'name code'
    ).lean(),
    Employer.find({ tenantId, _id: { $in: placements.map((p) => p.employerId) } }, 'name').lean(),
  ]);
  const subjectById = new Map(subjects.map((s) => [String(s._id), s]));
  const employerById = new Map(employers.map((e) => [String(e._id), e]));

  const status = enrollment?.status ?? 'active';
  const { rows } = computeBatch({
    members: [{ studentId, status }],
    attendance: records,
    grades: visibleGrades,
    assignments,
    submissions: submissions.filter((s) => s.status === 'reviewed'),
    projects: project ? [project] : [],
    placements,
  });
  const [row] = rows;

  const counts = { present: 0, late: 0, absent: 0, excused: 0 };
  for (const r of records) if (r.status in counts) counts[r.status] += 1;

  return {
    term: { _id: term._id, name: term.name, startDate: term.startDate, endDate: term.endDate },
    status,
    attendance: { pct: attendancePercent(counts), ...counts },
    summary: {
      assignmentsPct: row.assignmentsPct,
      finalAvg: row.finalAvg,
      delta: row.delta,
      mockScore: row.mockScore,
      projectScore: row.projectScore,
      readiness: row.readiness,
    },
    grades: visibleGrades.map((g) => ({
      subject: subjectById.get(String(g.subjectId)) ?? null,
      assessmentType: g.assessmentType,
      score: g.score,
    })),
    assignments: assignments.map((a) => {
      const s = submissionFor.get(String(a._id));
      const reviewed = s?.status === 'reviewed';
      return {
        _id: a._id,
        title: a.title,
        dueDate: a.dueDate,
        maxScore: a.maxScore,
        status: s?.status ?? 'pending',
        // A score the trainer has not finished reviewing is not the student's yet.
        score: reviewed ? s.score : null,
        feedback: reviewed ? (s.feedback ?? null) : null,
      };
    }),
    project: project
      ? {
          name: project.name,
          repoUrl: project.repoUrl ?? null,
          demoDate: project.demoDate ?? null,
          milestones: project.milestones,
          teamSize: project.memberIds.length,
          reviewScore: project.reviewScore ?? null,
        }
      : null,
    placements: placements.map((p) => ({
      _id: p._id,
      employer: employerById.get(String(p.employerId))?.name ?? null,
      role: p.role,
      stage: p.stage,
      appliedAt: p.appliedAt ?? null,
      interviewedAt: p.interviewedAt ?? null,
      offeredAt: p.offeredAt ?? null,
      joinedAt: p.joinedAt ?? null,
    })),
  };
}
