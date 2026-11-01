import { hasSeats, isBatchOrgType } from '@rooted/shared/utils';
import { normalizeIndianMobile } from '@rooted/shared/schemas';

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
    // The desk finds a visitor by typing part of their number; schools never
    // collect a learner phone, so only study centers search it.
    const fields = ['firstName', 'lastName', 'admissionNo'];
    if (hasSeats(opts.orgType)) fields.push('phone');
    filter.$or = fields.map((field) => ({ [field]: pattern }));
  }

  if (query.phone) filter.phone = normalizeIndianMobile(query.phone);

  // Walk-ins exist only in study centers. There the list hides them unless asked
  // (`kind=walk_in` for only them, `kind=all` for everyone). $ne, not equality:
  // rows written before `kind` existed have no value and are members.
  if (hasSeats(opts.orgType)) {
    if (query.kind === 'walk_in') filter.kind = 'walk_in';
    else if (query.kind !== 'all') filter.kind = { $ne: 'walk_in' };
  }

  if (query.sectionId && isBatchOrgType(opts.orgType) && opts.enrolledStudentIds) {
    delete filter.sectionId;
    filter._id = { $in: opts.enrolledStudentIds };
  }

  return filter;
}
