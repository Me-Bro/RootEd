import { TenantMembership } from '../models/TenantMembership.js';
import { Role } from '../models/Role.js';
import { AppError } from '../middleware/errorHandler.js';
import { SubjectTeacher } from '../models/SubjectTeacher.js';
import { Term } from '../models/Term.js';

/**
 * A teacher is an active member of this college holding any role but the
 * student one. teacherId in a request is only an ObjectId, so without this an
 * admin could name a user from another college, or a student.
 */
export async function assertTeacher(tenantId, userId) {
  const membership = await TenantMembership.findOne(
    { tenantId, userId, status: 'active' },
    'roleIds'
  ).lean();
  const roles = membership
    ? await Role.find({ _id: { $in: membership.roleIds }, tenantId }, 'templateKey').lean()
    : [];
  if (!roles.some((r) => r.templateKey !== 'student')) {
    throw new AppError('Teacher not found', 404);
  }
}

/**
 * Saving a timetable slot says who teaches a subject to a section, so record it as an
 * assignment too: for every term of the slot's academic year that has none, never
 * replacing one an admin already made (a slot may name a cover teacher). Returns how
 * many were created.
 *
 * The timetable routes do not check the teacher themselves, so this refuses anyone who
 * is not a teacher of this tenant (and creates nothing) rather than plant a bad
 * assignment that the rest of the app would then show.
 */
export async function ensureAssignments({
  tenantId,
  academicYearId,
  sectionId,
  subjectId,
  teacherId,
}) {
  try {
    await assertTeacher(tenantId, teacherId);
  } catch (err) {
    if (err.status === 404) return 0;
    throw err;
  }

  const terms = await Term.find({ tenantId, academicYearId }, '_id').lean();
  let created = 0;
  for (const term of terms) {
    try {
      const res = await SubjectTeacher.updateOne(
        { tenantId, subjectId, sectionId, termId: term._id },
        { $setOnInsert: { teacherId } },
        { upsert: true }
      );
      created += res.upsertedCount;
    } catch (err) {
      // A concurrent save made the same assignment first: that is the outcome we wanted.
      if (err.code !== 11000) throw err;
    }
  }
  return created;
}
