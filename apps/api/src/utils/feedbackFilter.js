const VALID_STATUSES = ['new', 'in_progress', 'resolved'];
const VALID_CATEGORIES = ['contact', 'feedback', 'bug', 'other'];

export function buildFeedbackFilter(query = {}) {
  const filter = {};
  if (VALID_STATUSES.includes(query.status)) filter.status = query.status;
  if (VALID_CATEGORIES.includes(query.category)) filter.category = query.category;
  if (query.tenantId) filter.tenantId = query.tenantId;
  return filter;
}
