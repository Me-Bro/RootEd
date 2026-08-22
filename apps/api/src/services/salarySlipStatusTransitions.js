export const SALARY_SLIP_STATUS_TRANSITIONS = {
  draft: ['queued'],
  queued: ['generated', 'failed'],
  generated: ['paid'],
  failed: ['queued'],
  paid: [],
};

export function isValidSalarySlipStatusTransition(from, to) {
  return (SALARY_SLIP_STATUS_TRANSITIONS[from] ?? []).includes(to);
}
