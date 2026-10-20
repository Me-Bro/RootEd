import { buildSubmissionUpdate } from '../utils/trainingSubmission.js';

const actor = '64b7f0c2a1b2c3d4e5f60718';
const now = new Date('2026-11-02T10:00:00Z');
const assignment = { maxScore: 10 };

test('a pending record sets no timestamps and clears any score', () => {
  const out = buildSubmissionUpdate({
    assignment,
    existing: null,
    input: { status: 'pending' },
    actorId: actor,
    now,
  });
  expect(out).toMatchObject({
    status: 'pending',
    score: null,
    submittedAt: null,
    reviewedAt: null,
  });
  expect(out.reviewedBy).toBeNull();
});

test('submitted stamps submittedAt once and keeps it on a later edit', () => {
  const first = buildSubmissionUpdate({
    assignment,
    existing: null,
    input: { status: 'submitted' },
    actorId: actor,
    now,
  });
  expect(first.submittedAt).toEqual(now);

  const later = new Date('2026-11-05T10:00:00Z');
  const second = buildSubmissionUpdate({
    assignment,
    existing: { status: 'submitted', submittedAt: first.submittedAt },
    input: { status: 'submitted', feedback: 'ok' },
    actorId: actor,
    now: later,
  });
  expect(second.submittedAt).toEqual(now);
});

test('reviewed records reviewer, time and score, and backfills submittedAt', () => {
  const out = buildSubmissionUpdate({
    assignment,
    existing: null,
    input: { status: 'reviewed', score: 8, feedback: 'Good' },
    actorId: actor,
    now,
  });
  expect(out).toMatchObject({ status: 'reviewed', score: 8, feedback: 'Good', reviewedAt: now });
  expect(String(out.reviewedBy)).toBe(actor);
  expect(out.submittedAt).toEqual(now);
});

test('a score equal to maxScore is allowed, one above is not', () => {
  expect(
    buildSubmissionUpdate({
      assignment,
      existing: null,
      input: { status: 'reviewed', score: 10 },
      actorId: actor,
      now,
    }).score
  ).toBe(10);
  expect(() =>
    buildSubmissionUpdate({
      assignment,
      existing: null,
      input: { status: 'reviewed', score: 10.5 },
      actorId: actor,
      now,
    })
  ).toThrow(/exceeds/i);
});

test('a zero score on a reviewed record is kept', () => {
  expect(
    buildSubmissionUpdate({
      assignment,
      existing: null,
      input: { status: 'reviewed', score: 0 },
      actorId: actor,
      now,
    }).score
  ).toBe(0);
});

test('moving back from reviewed to pending clears the review', () => {
  const out = buildSubmissionUpdate({
    assignment,
    existing: {
      status: 'reviewed',
      score: 8,
      submittedAt: now,
      reviewedAt: now,
      reviewedBy: actor,
    },
    input: { status: 'pending' },
    actorId: actor,
    now,
  });
  expect(out).toMatchObject({ score: null, reviewedAt: null, reviewedBy: null });
});
