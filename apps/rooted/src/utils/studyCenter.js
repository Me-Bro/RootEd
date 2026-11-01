// "06:00–14:00", or just one end when only one is set, or '' when neither is.
export function formatShiftHours(startTime, endTime) {
  if (startTime && endTime) return `${startTime}–${endTime}`;
  return startTime || endTime || '';
}

// Learners enrolled in a shift who do not yet hold a seat in it, in name order.
// `heldStudentIds` are the learners the seat map shows as holding one.
export function learnersWithoutSeat(students, heldStudentIds) {
  const held = new Set(heldStudentIds.map(String));
  return students
    .filter((s) => !held.has(String(s._id)))
    .sort((a, b) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`));
}

// Mirrors the API's canApplyAdHocDiscount: the owner always may, and the tenant's
// discountPolicy decides who else. The server is the authority; this only decides
// whether to offer the choice at all.
export function canApplyDiscount(policy, permissions) {
  if (permissions.includes('tenant:admin')) return true;
  if (policy === 'staff') return permissions.includes('fees:write');
  if (policy === 'desk') return permissions.includes('fees:collect');
  return false;
}

// Plans and day passes that are on sale, by name.
export function sellablePlans(structures) {
  return structures
    .filter((s) => s.plan?.kind && s.isActive !== false)
    .sort((a, b) => a.name.localeCompare(b.name));
}

// Discounts the desk may pick: ones for everybody that are inside their dates. A
// discount set up for one learner is applied automatically by the server, so it is
// never offered as a choice.
export function pickableDiscounts(discounts, now = new Date()) {
  return discounts
    .filter((d) => d.applicableTo === 'all')
    .filter((d) => !d.validFrom || new Date(d.validFrom) <= now)
    .filter((d) => !d.validTo || new Date(d.validTo) >= now)
    .sort((a, b) => a.name.localeCompare(b.name));
}
