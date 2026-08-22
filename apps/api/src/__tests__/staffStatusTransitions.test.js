import {
  STAFF_STATUS_TRANSITIONS,
  isValidStaffStatusTransition,
} from '../services/staffStatusTransitions.js';

test('active staff can move to on_leave, resigned, or terminated', () => {
  expect(isValidStaffStatusTransition('active', 'on_leave')).toBe(true);
  expect(isValidStaffStatusTransition('active', 'resigned')).toBe(true);
  expect(isValidStaffStatusTransition('active', 'terminated')).toBe(true);
});

test('on_leave staff can return to active or be resigned/terminated', () => {
  expect(isValidStaffStatusTransition('on_leave', 'active')).toBe(true);
  expect(isValidStaffStatusTransition('on_leave', 'resigned')).toBe(true);
  expect(isValidStaffStatusTransition('on_leave', 'terminated')).toBe(true);
});

test('resigned or terminated staff can only be reactivated to active', () => {
  expect(isValidStaffStatusTransition('resigned', 'active')).toBe(true);
  expect(isValidStaffStatusTransition('terminated', 'active')).toBe(true);
  expect(isValidStaffStatusTransition('resigned', 'on_leave')).toBe(false);
  expect(isValidStaffStatusTransition('terminated', 'resigned')).toBe(false);
});

test('a status transitioning to itself is not a transition', () => {
  expect(isValidStaffStatusTransition('active', 'active')).toBe(false);
});

test('unknown source status has no valid transitions', () => {
  expect(isValidStaffStatusTransition('bogus', 'active')).toBe(false);
});

test('STAFF_STATUS_TRANSITIONS exposes the allowed target list per status', () => {
  expect(STAFF_STATUS_TRANSITIONS.active).toEqual(['on_leave', 'resigned', 'terminated']);
  expect(STAFF_STATUS_TRANSITIONS.terminated).toEqual(['active']);
});
