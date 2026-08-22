export const STAFF_STATUS_TRANSITIONS = {
  active: ['on_leave', 'resigned', 'terminated'],
  on_leave: ['active', 'resigned', 'terminated'],
  resigned: ['active'],
  terminated: ['active'],
};

export function isValidStaffStatusTransition(from, to) {
  return (STAFF_STATUS_TRANSITIONS[from] ?? []).includes(to);
}
