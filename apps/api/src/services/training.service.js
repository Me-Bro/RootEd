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
 * Every student in a batch with their enrolment status.
 *
 * A batch is the active students whose home section is it, plus anyone holding
 * an Enrollment row for it — both, because Student.sectionId is what college
 * students are created with, while an Enrollment row is what records batch
 * membership and the admin's completion decision. A student with no row is
 * simply `active`.
 */
export async function getBatchEnrollments(tenantId, sectionId) {
  const enrollments = await Enrollment.find({ tenantId, sectionId }).lean();
  const byStudent = new Map(enrollments.map((e) => [String(e.studentId), e]));

  const students = await Student.find(
    {
      tenantId,
      status: 'active',
      $or: [{ sectionId }, { _id: { $in: enrollments.map((e) => e.studentId) } }],
    },
    'firstName lastName admissionNo sectionId placementConsent'
  )
    .sort({ admissionNo: 1 })
    .lean();

  return students.map((student) => {
    const enrollment = byStudent.get(String(student._id)) ?? null;
    return { student, enrollment, status: enrollment?.status ?? 'active' };
  });
}

/** Students who are still on the batch: everyone except those who dropped out. */
export async function getBatchRoster(tenantId, sectionId) {
  const batch = await getBatchEnrollments(tenantId, sectionId);
  return batch.filter((b) => b.status !== 'dropped').map((b) => b.student);
}

export async function assertOnRoster(tenantId, sectionId, studentIds) {
  const roster = await getBatchRoster(tenantId, sectionId);
  const onRoster = new Set(roster.map((s) => String(s._id)));
  if (studentIds.some((id) => !onRoster.has(String(id)))) {
    throw new AppError('Student is not on this batch', 404);
  }
  return roster;
}
