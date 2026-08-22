export function autoAssignSupported(applicableTo, classId) {
  if (applicableTo === 'all') return true;
  if (applicableTo === 'class') return Boolean(classId);
  return false;
}
