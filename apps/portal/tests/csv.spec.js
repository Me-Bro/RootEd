import { test, expect } from '@playwright/test';
import { toCsv } from '../src/lib/csv.js';

test.describe('toCsv', () => {
  test('quotes commas, quotes and newlines; blanks null', () => {
    expect(
      toCsv(
        ['a', 'b'],
        [
          ['x,y', 'say "hi"'],
          [null, 'l1\nl2'],
        ]
      )
    ).toBe('a,b\r\n"x,y","say ""hi"""\r\n,"l1\nl2"');
  });

  test('defuses formula-looking strings but not numbers', () => {
    expect(toCsv(['n'], [['=1+1'], ['@SUM(A1)'], ['-x'], [-5], ['ok']])).toBe(
      "n\r\n'=1+1\r\n'@SUM(A1)\r\n'-x\r\n-5\r\nok"
    );
  });
});
