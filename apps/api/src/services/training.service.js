import { Section } from '../models/Section.js';
import { Subject } from '../models/Subject.js';
import { Term } from '../models/Term.js';
import { Student } from '../models/Student.js';
import { Enrollment } from '../models/Enrollment.js';
import { AppError } from '../middleware/errorHandler.js';

/**
 * A ref in a request body is only an ObjectId: tenantScope guards queries, not
 * the validity of an id someone typed in. Without this, a trainer could attach
 * work to another college's section.
 */
export async function assertRefs(tenantId, { sectionId, subjectId, termId }) {
  const checks = [];
  if (sectionId) checks.push([Section, sectionId, 'Section']);
  if (subjectId) checks.push([Subject, subjectId, 'Subject']);
  if (termId) checks.push([Term, termId, 'Term']);

  const found = await Promise.all(checks.map(([Model, id]) => Model.exists({ _id: id, tenantId })));
  const missing = checks.find((_, i) => !found[i]);
  if (missing) throw new AppError(`${missing[2]} not found`, 404);
}

/**
 * Everyone on a batch's roster: active students whose home section is the
 * batch, plus anyone holding a live Enrollment for it. Both, because
 * Student.sectionId is what college students are created with, while an
 * Enrollment row is what records batch membership and completion.
 */
export async function getBatchRoster(tenantId, sectionId) {
  const enrollments = await Enrollment.find(
    { tenantId, sectionId, status: { $in: ['active', 'completed'] } },
    'studentId'
  ).lean();

  return Student.find(
    {
      tenantId,
      status: 'active',
      $or: [{ sectionId }, { _id: { $in: enrollments.map((e) => e.studentId) } }],
    },
    'firstName lastName admissionNo sectionId'
  )
    .sort({ admissionNo: 1 })
    .lean();
}

export async function assertOnRoster(tenantId, sectionId, studentIds) {
  const roster = await getBatchRoster(tenantId, sectionId);
  const onRoster = new Set(roster.map((s) => String(s._id)));
  if (studentIds.some((id) => !onRoster.has(String(id)))) {
    throw new AppError('Student is not on this batch', 404);
  }
  return roster;
}
