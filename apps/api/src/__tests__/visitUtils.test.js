import { isWithinOpenHours, closeInstantFor, autoCloseAt, localHHmm } from '../utils/openHours.js';
import { freeSeatsFor } from '../utils/seatPool.js';
import { selectVisitsToClose, MAX_VISIT_HOURS } from '../utils/visitClose.js';

const IST = 'Asia/Kolkata';
const centre = { openTime: '06:00', closeTime: '22:00', open24h: false };

describe('isWithinOpenHours', () => {
  const at = (iso) => new Date(iso);

  test('inside the window on the centre’s own clock, not UTC', () => {
    // 10:30 IST
    expect(isWithinOpenHours(at('2026-05-11T05:00:00Z'), centre, IST)).toBe(true);
    // 01:30 IST the next day: closed, though it is still the 11th in UTC.
    expect(isWithinOpenHours(at('2026-05-11T20:00:00Z'), centre, IST)).toBe(false);
  });

  test('opening time is inside, closing time is outside', () => {
    expect(isWithinOpenHours(at('2026-05-11T00:30:00Z'), centre, IST)).toBe(true); // 06:00
    expect(isWithinOpenHours(at('2026-05-11T00:29:00Z'), centre, IST)).toBe(false); // 05:59
    expect(isWithinOpenHours(at('2026-05-11T16:29:00Z'), centre, IST)).toBe(true); // 21:59
    expect(isWithinOpenHours(at('2026-05-11T16:30:00Z'), centre, IST)).toBe(false); // 22:00
  });

  test('a 24-hour centre is always open', () => {
    expect(isWithinOpenHours(at('2026-05-11T20:00:00Z'), { ...centre, open24h: true }, IST)).toBe(
      true
    );
  });

  test('localHHmm uses the timezone', () => {
    expect(localHHmm(at('2026-05-11T20:00:00Z'), IST)).toBe('01:30');
    expect(localHHmm(at('2026-05-11T20:00:00Z'), 'UTC')).toBe('20:00');
  });
});

describe('closeInstantFor and autoCloseAt', () => {
  const max = 16 * 60 * 60 * 1000;

  test('the closing instant of a day is closeTime on the centre’s clock', () => {
    // 22:00 IST on 11 May is 16:30 UTC.
    expect(closeInstantFor('2026-05-11', centre, IST).toISOString()).toBe(
      '2026-05-11T16:30:00.000Z'
    );
  });

  test('a visit that began in hours is due at that day’s closing time', () => {
    const inAt = new Date('2026-05-11T05:00:00Z'); // 10:30 IST
    expect(autoCloseAt(inAt, centre, IST, max).toISOString()).toBe('2026-05-11T16:30:00.000Z');
  });

  test('a visit that began after closing runs to the next closing time, capped at 16 hours', () => {
    const inAt = new Date('2026-05-11T17:00:00Z'); // 22:30 IST, after closing
    // The next closing is 24h later, so the 16-hour cap decides.
    expect(autoCloseAt(inAt, centre, IST, max).toISOString()).toBe('2026-05-12T09:00:00.000Z');
  });

  test('a visit that began long before closing is held to the 16-hour cap', () => {
    const inAt = new Date('2026-05-10T23:00:00Z'); // 04:30 IST on the 11th, before opening
    // Closing is 17 hours away, the cap is 16.
    expect(autoCloseAt(inAt, centre, IST, max).toISOString()).toBe('2026-05-11T15:00:00.000Z');
  });

  test('a 24-hour centre only has the cap', () => {
    const inAt = new Date('2026-05-11T05:00:00Z');
    expect(autoCloseAt(inAt, { ...centre, open24h: true }, IST, max).toISOString()).toBe(
      '2026-05-11T21:00:00.000Z'
    );
  });
});

describe('selectVisitsToClose', () => {
  const tenant = { _id: 't1', timezone: IST, orgType: 'study_center' };
  const tenants = new Map([['t1', tenant]]);
  const visit = (id, inAt, tenantId = 't1') => ({ _id: id, tenantId, inAt: new Date(inAt) });

  test('closes visits past closing time at the closing time, and leaves the rest', () => {
    const open = [visit('late', '2026-05-11T05:00:00Z'), visit('soon', '2026-05-11T09:00:00Z')];
    const now = new Date('2026-05-11T16:31:00Z'); // just after 22:00 IST
    const due = selectVisitsToClose({ openVisits: open, tenants, now });
    expect(due.map((d) => d.visitId)).toEqual(['late', 'soon']);
    expect(due[0].outAt.toISOString()).toBe('2026-05-11T16:30:00.000Z');

    const before = new Date('2026-05-11T16:00:00Z');
    expect(selectVisitsToClose({ openVisits: open, tenants, now: before })).toEqual([]);
  });

  test('a 24-hour centre closes only after the cap', () => {
    const open24 = new Map([['t1', { ...tenant, settings: { centre: { open24h: true } } }]]);
    const open = [visit('v', '2026-05-11T00:00:00Z')];
    expect(
      selectVisitsToClose({
        openVisits: open,
        tenants: open24,
        now: new Date('2026-05-11T15:00:00Z'),
      })
    ).toEqual([]);
    const due = selectVisitsToClose({
      openVisits: open,
      tenants: open24,
      now: new Date('2026-05-11T16:00:01Z'),
    });
    expect(due).toHaveLength(1);
    expect(MAX_VISIT_HOURS).toBe(16);
    expect(due[0].outAt.toISOString()).toBe('2026-05-11T16:00:00.000Z');
  });

  test('a visit of an unknown tenant is left alone', () => {
    const open = [visit('x', '2026-05-11T05:00:00Z', 'ghost')];
    expect(selectVisitsToClose({ openVisits: open, tenants, now: new Date('2026-06-01') })).toEqual(
      []
    );
  });
});

describe('freeSeatsFor', () => {
  const seats = ['A-1', 'A-2', 'A-3', 'A-10'].map((label) => ({
    _id: label,
    label,
    isActive: true,
  }));
  const allocations = [{ seatId: 'A-1' }];

  test('a walk-in is never offered a seat any member holds, in any shift (AC4)', () => {
    const r = freeSeatsFor({ seats, allocations, openVisits: [], student: { kind: 'walk_in' } });
    expect(r.map((s) => s.label)).toEqual(['A-2', 'A-3', 'A-10']);
  });

  test('a member may use any free seat, their own first', () => {
    const r = freeSeatsFor({
      seats,
      allocations,
      openVisits: [],
      student: { kind: 'member' },
      ownSeatIds: ['A-3'],
    });
    expect(r.map((s) => [s.label, s.own])).toEqual([
      ['A-3', true],
      ['A-1', false],
      ['A-2', false],
      ['A-10', false],
    ]);
  });

  test('a seat someone is on is not offered to anyone', () => {
    const open = [{ seatId: 'A-2' }];
    expect(
      freeSeatsFor({ seats, allocations: [], openVisits: open, student: { kind: 'member' } }).map(
        (s) => s.label
      )
    ).toEqual(['A-1', 'A-3', 'A-10']);
  });

  test('a seat out of use is never offered', () => {
    const off = [...seats, { _id: 'Z', label: 'Z-1', isActive: false }];
    expect(
      freeSeatsFor({ seats: off, allocations: [], openVisits: [], student: {} }).map((s) => s.label)
    ).not.toContain('Z-1');
  });

  test('a learner with no kind is treated as a member (legacy rows)', () => {
    expect(
      freeSeatsFor({ seats, allocations, openVisits: [], student: {} }).map((s) => s.label)
    ).toContain('A-1');
  });
});
