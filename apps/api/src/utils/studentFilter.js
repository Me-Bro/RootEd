import { isBatchOrgType } from '@rooted/shared/utils';

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// `opts.enrolledStudentIds`, when given, is the caller's already-resolved
// Enrollment lookup for a batch-orgType tenant — a coaching/tuition learner
// isn't tied to one Student.sectionId, so `sectionId` there means "enrolled
// in this batch" (Enrollment membership), not "this student's section".
export function buildStudentFilter(tenantId, query = {}, opts = {}) {
  const filter = { tenantId };
  if (query.sectionId) filter.sectionId = query.sectionId;
  if (query.status) filter.status = query.status;

  const search = query.search?.trim();
  if (search) {
    const pattern = new RegExp(escapeRegex(search), 'i');
    filter.$or = ['firstName', 'lastName', 'admissionNo'].map((field) => ({ [field]: pattern }));
  }

  if (query.sectionId && isBatchOrgType(opts.orgType) && opts.enrolledStudentIds) {
    delete filter.sectionId;
    filter._id = { $in: opts.enrolledStudentIds };
  }

  return filter;
}
