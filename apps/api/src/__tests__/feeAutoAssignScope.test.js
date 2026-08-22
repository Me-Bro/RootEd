import { autoAssignSupported } from '../utils/feeAutoAssignScope.js';

test('all is always supported', () => {
  expect(autoAssignSupported('all', null)).toBe(true);
});

test('class requires a classId', () => {
  expect(autoAssignSupported('class', 'abc')).toBe(true);
  expect(autoAssignSupported('class', null)).toBe(false);
});

test('student scope is never auto-assigned', () => {
  expect(autoAssignSupported('student', null)).toBe(false);
});
