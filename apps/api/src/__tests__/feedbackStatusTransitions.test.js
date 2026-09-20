import {
  FEEDBACK_STATUS_TRANSITIONS,
  isValidFeedbackStatusTransition,
} from '../services/feedbackStatusTransitions.js';

test('new feedback can move to in_progress or resolved', () => {
  expect(isValidFeedbackStatusTransition('new', 'in_progress')).toBe(true);
  expect(isValidFeedbackStatusTransition('new', 'resolved')).toBe(true);
});

test('in_progress feedback can move to resolved or back to new', () => {
  expect(isValidFeedbackStatusTransition('in_progress', 'resolved')).toBe(true);
  expect(isValidFeedbackStatusTransition('in_progress', 'new')).toBe(true);
});

test('resolved feedback can only be reopened to in_progress', () => {
  expect(isValidFeedbackStatusTransition('resolved', 'in_progress')).toBe(true);
  expect(isValidFeedbackStatusTransition('resolved', 'new')).toBe(false);
});

test('a status transitioning to itself is not a transition', () => {
  expect(isValidFeedbackStatusTransition('new', 'new')).toBe(false);
});

test('unknown source status has no valid transitions', () => {
  expect(isValidFeedbackStatusTransition('bogus', 'new')).toBe(false);
});

test('FEEDBACK_STATUS_TRANSITIONS exposes the allowed target list per status', () => {
  expect(FEEDBACK_STATUS_TRANSITIONS.new).toEqual(['in_progress', 'resolved']);
  expect(FEEDBACK_STATUS_TRANSITIONS.resolved).toEqual(['in_progress']);
});
