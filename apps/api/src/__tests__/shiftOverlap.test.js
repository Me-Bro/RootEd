import { describe, it, expect } from '@jest/globals';
import { shiftWindow, shiftsOverlap } from '../utils/shiftOverlap.js';

const shift = (startTime, endTime) => ({ startTime, endTime });

describe('shiftWindow', () => {
  it('converts HH:mm to minutes since midnight', () => {
    expect(shiftWindow(shift('06:30', '12:00'))).toEqual({ start: 390, end: 720 });
  });

  it('defaults a missing start to midnight and a missing end to end of day', () => {
    expect(shiftWindow(shift(undefined, '12:00'))).toEqual({ start: 0, end: 720 });
    expect(shiftWindow(shift('18:00', undefined))).toEqual({ start: 1080, end: 1440 });
  });

  it('treats a shift with no hours (or nothing at all) as all-day', () => {
    expect(shiftWindow({})).toEqual({ start: 0, end: 1440 });
    expect(shiftWindow()).toEqual({ start: 0, end: 1440 });
    expect(shiftWindow(shift(null, null))).toEqual({ start: 0, end: 1440 });
  });
});

describe('shiftsOverlap', () => {
  it('is true when the ranges share time', () => {
    expect(shiftsOverlap(shift('08:00', '14:00'), shift('12:00', '18:00'))).toBe(true);
  });

  it('is symmetric', () => {
    expect(shiftsOverlap(shift('12:00', '18:00'), shift('08:00', '14:00'))).toBe(true);
    expect(shiftsOverlap(shift('06:00', '10:00'), shift('16:00', '20:00'))).toBe(false);
    expect(shiftsOverlap(shift('16:00', '20:00'), shift('06:00', '10:00'))).toBe(false);
  });

  it('is true when one range contains the other', () => {
    expect(shiftsOverlap(shift('06:00', '20:00'), shift('10:00', '12:00'))).toBe(true);
  });

  it('is true for identical ranges', () => {
    expect(shiftsOverlap(shift('06:00', '12:00'), shift('06:00', '12:00'))).toBe(true);
  });

  it('is false for adjacent ranges (end equals start)', () => {
    expect(shiftsOverlap(shift('06:00', '12:00'), shift('12:00', '18:00'))).toBe(false);
    expect(shiftsOverlap(shift('12:00', '18:00'), shift('06:00', '12:00'))).toBe(false);
  });

  it('is false for a one-minute gap', () => {
    expect(shiftsOverlap(shift('06:00', '11:59'), shift('12:00', '18:00'))).toBe(false);
  });

  it('overlaps everything when a shift has no hours', () => {
    expect(shiftsOverlap({}, shift('06:00', '12:00'))).toBe(true);
    expect(shiftsOverlap(shift('06:00', '12:00'), {})).toBe(true);
    expect(shiftsOverlap({}, {})).toBe(true);
  });

  it('uses the defaults when only one bound is set', () => {
    // No start: 00:00-12:00. No end: 18:00-24:00.
    expect(shiftsOverlap(shift(undefined, '12:00'), shift('11:00', '13:00'))).toBe(true);
    expect(shiftsOverlap(shift(undefined, '12:00'), shift('12:00', '13:00'))).toBe(false);
    expect(shiftsOverlap(shift('18:00', undefined), shift('17:00', '18:00'))).toBe(false);
    expect(shiftsOverlap(shift('18:00', undefined), shift('23:00', '23:30'))).toBe(true);
  });
});
