import { coverageFor } from '../utils/planCoverage.js';
import { zonedMidnight, addDaysToDayString } from '../utils/dayKey.js';

describe('zonedMidnight', () => {
  test('IST midnight is 18:30 UTC the evening before', () => {
    expect(zonedMidnight('2026-05-11', 'Asia/Kolkata').toISOString()).toBe(
      '2026-05-10T18:30:00.000Z'
    );
  });

  test('a western timezone starts the day later in UTC, across a daylight change', () => {
    expect(zonedMidnight('2026-01-15', 'America/Los_Angeles').toISOString()).toBe(
      '2026-01-15T08:00:00.000Z'
    );
    expect(zonedMidnight('2026-07-15', 'America/Los_Angeles').toISOString()).toBe(
      '2026-07-15T07:00:00.000Z'
    );
  });

  test('UTC is its own midnight', () => {
    expect(zonedMidnight('2026-03-01', 'UTC').toISOString()).toBe('2026-03-01T00:00:00.000Z');
  });
});

describe('addDaysToDayString', () => {
  test('crosses month and year ends', () => {
    expect(addDaysToDayString('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDaysToDayString('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDaysToDayString('2026-03-01', -1)).toBe('2026-02-28');
  });
});

describe('coverageFor', () => {
  const ist = 'Asia/Kolkata';

  test('a day pass covers the whole IST day, even when sold at 23:30', () => {
    const { coversFrom, coversTo } = coverageFor({
      plan: { kind: 'day_pass', durationDays: 1 },
      startDate: new Date('2026-05-11T18:00:00Z'), // 23:30 IST on 11 May
      timezone: ist,
    });
    expect(coversFrom.toISOString()).toBe('2026-05-10T18:30:00.000Z');
    // The last millisecond of 11 May IST.
    expect(coversTo.toISOString()).toBe('2026-05-11T18:29:59.999Z');
  });

  test('a day pass sold at 00:30 IST belongs to that IST day, not the UTC day before', () => {
    const { coversFrom } = coverageFor({
      plan: { kind: 'day_pass', durationDays: 1 },
      startDate: new Date('2026-05-10T19:00:00Z'), // 00:30 IST on 11 May
      timezone: ist,
    });
    expect(coversFrom.toISOString()).toBe('2026-05-10T18:30:00.000Z');
  });

  test('a 30-day shift plan covers 30 calendar days from the start', () => {
    const { coversFrom, coversTo } = coverageFor({
      plan: { kind: 'shift_plan', durationDays: 30 },
      startDate: new Date('2026-05-11T05:00:00Z'),
      timezone: ist,
    });
    expect(coversFrom.toISOString()).toBe('2026-05-10T18:30:00.000Z');
    // 11 May is day 1 and 9 June is day 30: covered through the end of 9 June IST.
    expect(coversTo.toISOString()).toBe('2026-06-09T18:29:59.999Z');
  });

  test('a one-day shift plan matches a day pass', () => {
    const start = new Date('2026-05-11T05:00:00Z');
    const a = coverageFor({
      plan: { kind: 'shift_plan', durationDays: 1 },
      startDate: start,
      timezone: ist,
    });
    const b = coverageFor({
      plan: { kind: 'day_pass', durationDays: 1 },
      startDate: start,
      timezone: ist,
    });
    expect(a).toEqual(b);
  });
});
