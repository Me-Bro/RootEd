import { dayKeyInTz, dayStringInTz } from '../utils/dayKey.js';

describe('dayKeyInTz', () => {
  test('00:30 IST belongs to that IST date, not the previous UTC day', () => {
    const instant = new Date('2026-05-10T19:00:00Z'); // 00:30 on 11 May in IST
    expect(dayStringInTz(instant, 'Asia/Kolkata')).toBe('2026-05-11');
    expect(dayKeyInTz(instant, 'Asia/Kolkata').toISOString()).toBe('2026-05-11T00:00:00.000Z');
  });

  test('23:30 IST still belongs to that IST date', () => {
    const instant = new Date('2026-05-11T18:00:00Z'); // 23:30 on 11 May in IST
    expect(dayStringInTz(instant, 'Asia/Kolkata')).toBe('2026-05-11');
  });

  test('the same instant is a different day in another timezone', () => {
    const instant = new Date('2026-05-11T03:00:00Z');
    expect(dayStringInTz(instant, 'America/Los_Angeles')).toBe('2026-05-10');
    expect(dayStringInTz(instant, 'Asia/Kolkata')).toBe('2026-05-11');
  });

  test('defaults to Asia/Kolkata and returns a UTC-midnight Date', () => {
    const key = dayKeyInTz(new Date('2026-01-01T10:00:00Z'));
    expect(key.getUTCHours()).toBe(0);
    expect(key.toISOString()).toBe('2026-01-01T00:00:00.000Z');
  });
});
