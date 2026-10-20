import { nextStageAllowed, buildStageMove } from '../utils/placementStage.js';

describe('nextStageAllowed', () => {
  test.each([
    ['applied', 'interviewed'],
    ['applied', 'offered'], // skipping a step is allowed: an offer can follow a walk-in
    ['applied', 'joined'],
    ['interviewed', 'offered'],
    ['offered', 'joined'],
    ['applied', 'rejected'],
    ['interviewed', 'withdrawn'],
    ['offered', 'rejected'],
  ])('%s → %s is allowed', (from, to) => {
    expect(nextStageAllowed(from, to)).toBe(true);
  });

  test.each([
    ['interviewed', 'applied'],
    ['offered', 'interviewed'],
    ['joined', 'offered'],
    ['applied', 'applied'],
    ['joined', 'rejected'],
    ['rejected', 'applied'],
    ['rejected', 'interviewed'],
    ['withdrawn', 'applied'],
    ['withdrawn', 'rejected'],
  ])('%s → %s is refused', (from, to) => {
    expect(nextStageAllowed(from, to)).toBe(false);
  });

  test('an unknown stage is never allowed', () => {
    expect(nextStageAllowed('applied', 'hired')).toBe(false);
    expect(nextStageAllowed('shortlisted', 'offered')).toBe(false);
  });
});

describe('buildStageMove', () => {
  const t0 = new Date('2026-10-01T00:00:00Z');
  const t1 = new Date('2026-10-10T00:00:00Z');
  const t2 = new Date('2026-10-20T00:00:00Z');
  const app = { stage: 'applied', appliedAt: t0 };

  test('records the date against the stage it reached', () => {
    expect(buildStageMove(app, 'interviewed', t1)).toEqual({
      stage: 'interviewed',
      interviewedAt: t1,
    });
    expect(buildStageMove({ ...app, stage: 'offered', offeredAt: t1 }, 'joined', t2)).toEqual({
      stage: 'joined',
      joinedAt: t2,
    });
  });

  test('a rejection or withdrawal records closedAt', () => {
    expect(buildStageMove(app, 'rejected', t1)).toEqual({ stage: 'rejected', closedAt: t1 });
    expect(buildStageMove(app, 'withdrawn', t1)).toEqual({ stage: 'withdrawn', closedAt: t1 });
  });

  test('moving backwards throws a 400 with a clear message', () => {
    const interviewed = { stage: 'interviewed', appliedAt: t0, interviewedAt: t1 };
    expect(() => buildStageMove(interviewed, 'applied', t2)).toThrow(/cannot move/i);
    try {
      buildStageMove(interviewed, 'applied', t2);
    } catch (err) {
      expect(err.status).toBe(400);
    }
  });

  test('a terminal application cannot move at all', () => {
    expect(() => buildStageMove({ stage: 'joined', joinedAt: t1 }, 'offered', t2)).toThrow();
    expect(() => buildStageMove({ stage: 'rejected', closedAt: t1 }, 'applied', t2)).toThrow();
  });

  test('a date earlier than the latest recorded stage is refused', () => {
    const interviewed = { stage: 'interviewed', appliedAt: t0, interviewedAt: t1 };
    expect(() => buildStageMove(interviewed, 'offered', new Date('2026-10-05T00:00:00Z'))).toThrow(
      /before/i
    );
  });

  test('the same date as the previous stage is fine', () => {
    expect(buildStageMove(app, 'interviewed', t0)).toEqual({
      stage: 'interviewed',
      interviewedAt: t0,
    });
  });

  test('skipping a stage leaves the skipped date unset', () => {
    const out = buildStageMove(app, 'offered', t1);
    expect(out).toEqual({ stage: 'offered', offeredAt: t1 });
    expect(out.interviewedAt).toBeUndefined();
  });
});
