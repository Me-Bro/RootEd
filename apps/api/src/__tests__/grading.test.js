import { scoreToLetter } from '@rooted/shared/utils';

test.each([
  [95, 'A'],
  [90, 'A'],
  [89, 'B'],
  [80, 'B'],
  [79, 'C'],
  [70, 'C'],
  [69, 'D'],
  [60, 'D'],
  [59, 'F'],
  [0, 'F'],
  [-5, 'F'],
  [105, 'A'],
])('scoreToLetter(%d) -> %s', (score, letter) => {
  expect(scoreToLetter(score)).toBe(letter);
});

test('non-numeric score returns empty string', () => {
  expect(scoreToLetter(undefined)).toBe('');
  expect(scoreToLetter('abc')).toBe('');
});

test('empty string coerces to 0 (Number(""))', () => {
  expect(scoreToLetter('')).toBe('F');
});
