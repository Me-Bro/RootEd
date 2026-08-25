import { bucketAttendanceTrend } from '../utils/attendanceTrend.js';

test('7-day window returns one point per day, unrounded pct to 1 decimal', () => {
  const dailyStats = [
    { date: '2026-08-20', presentCount: 871, totalCount: 962 },
    { date: '2026-08-19', presentCount: 874, totalCount: 962 },
  ];

  const result = bucketAttendanceTrend(dailyStats, 7);

  expect(result).toEqual([
    { date: '2026-08-19', presentPct: 90.9 },
    { date: '2026-08-20', presentPct: 90.5 },
  ]);
});

test('7-day window sorts ascending by date regardless of input order', () => {
  const dailyStats = [
    { date: '2026-08-21', presentCount: 1, totalCount: 1 },
    { date: '2026-08-17', presentCount: 1, totalCount: 1 },
    { date: '2026-08-19', presentCount: 1, totalCount: 1 },
  ];

  const result = bucketAttendanceTrend(dailyStats, 7);

  expect(result.map((r) => r.date)).toEqual(['2026-08-17', '2026-08-19', '2026-08-21']);
});

test('30-day window sums days into Monday-start weekly buckets, not one point per day', () => {
  const dailyStats = [
    // week of 17 Aug (Mon 17 - Fri 21)
    { date: '2026-08-17', presentCount: 90, totalCount: 100 },
    { date: '2026-08-21', presentCount: 80, totalCount: 100 },
    // week of 10 Aug (Mon 10 - Fri 14)
    { date: '2026-08-10', presentCount: 50, totalCount: 100 },
  ];

  const result = bucketAttendanceTrend(dailyStats, 30);

  expect(result).toEqual([
    { weekStart: '2026-08-10', presentPct: 50 },
    { weekStart: '2026-08-17', presentPct: 85 },
  ]);
});

test('a Sunday attendance record buckets into the week starting the Monday before it', () => {
  // 23 Aug 2026 is a Sunday; its Monday is 17 Aug.
  const dailyStats = [{ date: '2026-08-23', presentCount: 1, totalCount: 2 }];

  const result = bucketAttendanceTrend(dailyStats, 30);

  expect(result).toEqual([{ weekStart: '2026-08-17', presentPct: 50 }]);
});

test('a day with zero records yields a null pct instead of dividing by zero', () => {
  const dailyStats = [{ date: '2026-08-21', presentCount: 0, totalCount: 0 }];

  const result = bucketAttendanceTrend(dailyStats, 7);

  expect(result).toEqual([{ date: '2026-08-21', presentPct: null }]);
});
