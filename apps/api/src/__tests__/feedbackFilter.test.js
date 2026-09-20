import { buildFeedbackFilter } from '../utils/feedbackFilter.js';

test('empty query yields empty filter', () => {
  expect(buildFeedbackFilter({})).toEqual({});
});

test('status passes through as exact match', () => {
  expect(buildFeedbackFilter({ status: 'new' })).toEqual({ status: 'new' });
});

test('category passes through as exact match', () => {
  expect(buildFeedbackFilter({ category: 'bug' })).toEqual({ category: 'bug' });
});

test('tenantId passes through as exact match', () => {
  expect(buildFeedbackFilter({ tenantId: 'tenant-1' })).toEqual({ tenantId: 'tenant-1' });
});

test('unknown query keys are ignored', () => {
  expect(buildFeedbackFilter({ bogus: 'x', status: 'new' })).toEqual({ status: 'new' });
});

test('invalid status value is ignored, not passed through', () => {
  expect(buildFeedbackFilter({ status: 'not-a-real-status' })).toEqual({});
});

test('invalid category value is ignored, not passed through', () => {
  expect(buildFeedbackFilter({ category: 'not-a-real-category' })).toEqual({});
});
