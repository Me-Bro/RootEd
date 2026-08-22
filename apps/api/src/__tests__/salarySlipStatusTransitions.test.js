import {
  SALARY_SLIP_STATUS_TRANSITIONS,
  isValidSalarySlipStatusTransition,
} from '../services/salarySlipStatusTransitions.js';

test('a generated slip can be marked paid', () => {
  expect(isValidSalarySlipStatusTransition('generated', 'paid')).toBe(true);
});

test('a draft slip cannot jump directly to paid', () => {
  expect(isValidSalarySlipStatusTransition('draft', 'paid')).toBe(false);
});

test('paid is terminal — no outgoing transitions', () => {
  expect(isValidSalarySlipStatusTransition('paid', 'draft')).toBe(false);
  expect(isValidSalarySlipStatusTransition('paid', 'generated')).toBe(false);
  expect(SALARY_SLIP_STATUS_TRANSITIONS.paid).toEqual([]);
});

test('a queued slip resolves to generated or failed', () => {
  expect(isValidSalarySlipStatusTransition('queued', 'generated')).toBe(true);
  expect(isValidSalarySlipStatusTransition('queued', 'failed')).toBe(true);
});

test('a failed slip can be retried back to queued', () => {
  expect(isValidSalarySlipStatusTransition('failed', 'queued')).toBe(true);
});

test('a status transitioning to itself is not a transition', () => {
  expect(isValidSalarySlipStatusTransition('generated', 'generated')).toBe(false);
});

test('an unknown source status has no valid transitions', () => {
  expect(isValidSalarySlipStatusTransition('bogus', 'queued')).toBe(false);
});

test('SALARY_SLIP_STATUS_TRANSITIONS exposes the allowed target list per status', () => {
  expect(SALARY_SLIP_STATUS_TRANSITIONS.queued).toEqual(['generated', 'failed']);
  expect(SALARY_SLIP_STATUS_TRANSITIONS.generated).toEqual(['paid']);
});
