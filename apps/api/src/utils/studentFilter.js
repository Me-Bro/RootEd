function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function buildStudentFilter(tenantId, query = {}) {
  const filter = { tenantId };
  if (query.sectionId) filter.sectionId = query.sectionId;
  if (query.status) filter.status = query.status;

  const search = query.search?.trim();
  if (search) {
    const pattern = new RegExp(escapeRegex(search), 'i');
    filter.$or = ['firstName', 'lastName', 'admissionNo'].map((field) => ({ [field]: pattern }));
  }

  return filter;
}
