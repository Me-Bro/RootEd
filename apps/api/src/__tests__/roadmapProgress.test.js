import { studentProgress, rankStudents, pctOf } from '../utils/roadmapProgress.js';

const items = [
  { _id: 'a', type: 'theory' },
  { _id: 'b', type: 'practical' },
  { _id: 'c', type: 'assignment' },
  { _id: 'd', type: 'theory' },
];

describe('studentProgress', () => {
  test('counts completed over every item, locked ones included', () => {
    expect(studentProgress(items, ['a', 'c'])).toMatchObject({ completed: 2, total: 4, pct: 50 });
  });

  test('breaks the figures down by type', () => {
    const { byType } = studentProgress(items, ['a', 'b']);
    expect(byType).toEqual({
      theory: { completed: 1, total: 2 },
      practical: { completed: 1, total: 1 },
      assignment: { completed: 0, total: 1 },
    });
  });

  test('nothing done is a real 0, nothing to do is null (never 0)', () => {
    expect(studentProgress(items, []).pct).toBe(0);
    expect(studentProgress([], [])).toMatchObject({ completed: 0, total: 0, pct: null });
  });

  test('ignores completed ids that are not items, and compares ids as strings', () => {
    const oid = (s) => ({ toString: () => s });
    expect(studentProgress(items, ['zzz', oid('a')]).completed).toBe(1);
  });

  test('rounds to one decimal', () => {
    expect(pctOf(1, 3)).toBe(33.3);
  });
});

describe('rankStudents', () => {
  const row = (displayName, completed) => ({ displayName, completed });

  test('orders by completed, highest first', () => {
    expect(rankStudents([row('A', 1), row('B', 3), row('C', 2)]).map((r) => r.displayName)).toEqual(
      ['B', 'C', 'A']
    );
  });

  test('ties share a rank and the next rank skips', () => {
    const ranked = rankStudents([row('A', 2), row('B', 2), row('C', 1), row('D', 0)]);
    expect(ranked.map((r) => r.rank)).toEqual([1, 1, 3, 4]);
  });

  test('ties are listed alphabetically', () => {
    expect(rankStudents([row('Zoya', 1), row('Asha', 1)]).map((r) => r.displayName)).toEqual([
      'Asha',
      'Zoya',
    ]);
  });

  test('an empty board stays empty and does not mutate the input', () => {
    expect(rankStudents([])).toEqual([]);
    const input = [row('B', 1), row('A', 2)];
    rankStudents(input);
    expect(input.map((r) => r.displayName)).toEqual(['B', 'A']);
  });
});
