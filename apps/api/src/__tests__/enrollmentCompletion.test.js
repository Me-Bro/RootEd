import { applyCompletion } from '../utils/enrollmentCompletion.js';

const now = new Date('2026-12-01T09:00:00Z');
const earlier = new Date('2026-11-20T09:00:00Z');

test('completing sets the status and stamps endDate', () => {
  expect(applyCompletion({ status: 'active' }, 'completed', undefined, now)).toEqual({
    status: 'completed',
    endDate: now,
  });
});

test('dropping also stamps endDate', () => {
  expect(applyCompletion({ status: 'active' }, 'dropped', undefined, now)).toEqual({
    status: 'dropped',
    endDate: now,
  });
});

test('re-marking completed keeps the original endDate', () => {
  expect(
    applyCompletion({ status: 'completed', endDate: earlier }, 'completed', undefined, now)
  ).toEqual({ status: 'completed', endDate: earlier });
});

test('reverting to active clears endDate (EH8)', () => {
  expect(
    applyCompletion({ status: 'completed', endDate: earlier }, 'active', undefined, now)
  ).toEqual({ status: 'active', endDate: null });
});

test('a row that does not exist yet behaves like an active one', () => {
  expect(applyCompletion(null, 'completed', undefined, now)).toEqual({
    status: 'completed',
    endDate: now,
  });
});

test('notes are stored when given, left alone when not', () => {
  expect(applyCompletion(null, 'dropped', 'moved city', now).notes).toBe('moved city');
  expect('notes' in applyCompletion(null, 'dropped', undefined, now)).toBe(false);
});

test('an unknown status is refused', () => {
  expect(() => applyCompletion(null, 'graduated', undefined, now)).toThrow();
});
