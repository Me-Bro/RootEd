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
