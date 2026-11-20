import { describe, expect, test } from '@jest/globals';
import { DESK_FILTERS } from '@rooted/shared/constants';
import { buildActivity, buildSeatTiles, buildSummary, filterLearners } from '../utils/deskView.js';

const id = (n) => `id-${n}`;
const seat = (n, extra = {}) => ({ _id: id(`seat${n}`), label: `A-${n}`, ...extra });

describe('buildSeatTiles', () => {
  const seats = [
    seat(1, { zone: 'Quiet' }),
    seat(2),
    seat(3),
    seat(10),
    seat(4, { isActive: false }),
  ];
  const names = new Map([
    ['s1', 'Asha Study'],
    ['s2', 'Ravi Study'],
  ]);
  const holds = [
    { seatId: id('seat1'), studentId: 's1', startDate: new Date('2026-01-01') },
    { seatId: id('seat3'), studentId: 's2', startDate: new Date('2026-01-01') },
  ];

  test('a seat nobody holds and nobody is on is free and in the day-pass pool', () => {
    const tiles = buildSeatTiles({ seats, allocations: [], openVisits: [], names });
    expect(tiles.find((t) => t.label === 'A-2')).toMatchObject({ state: 'free', pool: true });
  });

  test('a seat held by an absent member is held, not free, and names the holder', () => {
    const tiles = buildSeatTiles({ seats, allocations: holds, openVisits: [], names });
    expect(tiles.find((t) => t.label === 'A-1')).toMatchObject({
      state: 'held',
      pool: false,
      holder: { studentId: 's1', name: 'Asha Study' },
    });
  });

  test('a seat with an open visit is occupied by whoever is on it, even if another member holds it', () => {
    const openVisits = [
      { _id: 'v1', seatId: id('seat3'), studentId: 's1', inAt: new Date('2026-05-11T05:00:00Z') },
    ];
    const tiles = buildSeatTiles({ seats, allocations: holds, openVisits, names });
    const tile = tiles.find((t) => t.label === 'A-3');
    expect(tile.state).toBe('occupied');
    expect(tile.occupant).toMatchObject({ studentId: 's1', name: 'Asha Study', visitId: 'v1' });
    expect(tile.holder).toMatchObject({ studentId: 's2' });
  });

  test('inactive seats are left out and labels sort naturally (A-2 before A-10)', () => {
    const tiles = buildSeatTiles({ seats, allocations: [], openVisits: [], names });
    expect(tiles.map((t) => t.label)).toEqual(['A-1', 'A-2', 'A-3', 'A-10']);
  });
});

describe('buildSummary', () => {
  test('counts inside, free seats and today’s check-ins', () => {
    const tiles = [{ state: 'occupied' }, { state: 'held' }, { state: 'free' }, { state: 'free' }];
    expect(
      buildSummary({
        tiles,
        openCount: 1,
        checkInsToday: 7,
        open: true,
        centre: { openTime: '06:00', closeTime: '22:00', open24h: false },
      })
    ).toEqual({
      insideNow: 1,
      seatsActive: 4,
      freeSeats: 3,
      checkInsToday: 7,
      openNow: true,
      openTime: '06:00',
      closeTime: '22:00',
      open24h: false,
    });
  });
});

describe('filterLearners', () => {
  const learners = [
    { _id: 'a', inside: { visitId: 'v' }, entitlement: { status: 'valid' } },
    { _id: 'b', inside: null, entitlement: { status: 'unpaid' } },
    { _id: 'c', inside: null, entitlement: { status: 'valid' } },
    { _id: 'd', inside: { visitId: 'w' }, entitlement: { status: 'expired' } },
    { _id: 'e', inside: null },
  ];

  test('exposes the supported filters', () => {
    expect(DESK_FILTERS).toEqual(['all', 'inside', 'notInside', 'warning']);
  });

  test('all keeps everyone', () => {
    expect(filterLearners(learners, 'all').map((l) => l._id)).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  test('inside and notInside split on the open visit', () => {
    expect(filterLearners(learners, 'inside').map((l) => l._id)).toEqual(['a', 'd']);
    expect(filterLearners(learners, 'notInside').map((l) => l._id)).toEqual(['b', 'c', 'e']);
  });

  test('warning keeps learners whose plan is not valid; unknown entitlement is not a warning', () => {
    expect(filterLearners(learners, 'warning').map((l) => l._id)).toEqual(['b', 'd']);
  });
});

describe('buildActivity', () => {
  const now = new Date('2026-05-11T08:00:00Z');
  const visits = [
    {
      _id: 'v1',
      studentId: 's1',
      seatId: 'x1',
      inAt: new Date('2026-05-11T01:00:00Z'),
      outAt: new Date('2026-05-11T03:00:00Z'),
    },
    { _id: 'v2', studentId: 's2', seatId: 'x2', inAt: new Date('2026-05-11T02:00:00Z') },
    {
      _id: 'v3',
      studentId: 's1',
      seatId: 'x1',
      inAt: new Date('2026-05-11T04:00:00Z'),
      outAt: new Date('2026-05-11T07:00:00Z'),
      bulkClosed: true,
    },
    {
      _id: 'v4',
      studentId: 's2',
      seatId: 'x2',
      inAt: new Date('2026-05-11T00:30:00Z'),
      outAt: new Date('2026-05-11T01:30:00Z'),
      autoClosed: true,
    },
  ];
  const names = new Map([
    ['s1', 'Asha Study'],
    ['s2', 'Ravi Study'],
  ]);
  const labels = new Map([
    ['x1', 'A-1'],
    ['x2', 'A-2'],
  ]);

  test('newest event first, with minutes and the flags; an open visit counts to now', () => {
    const rows = buildActivity({ visits, names, seatLabels: labels, now });
    expect(rows.map((r) => r.visitId)).toEqual(['v3', 'v1', 'v2', 'v4']);
    expect(rows[0]).toMatchObject({
      studentId: 's1',
      name: 'Asha Study',
      seatLabel: 'A-1',
      minutes: 180,
      bulkClosed: true,
      autoClosed: false,
    });
    expect(rows[2]).toMatchObject({ outAt: null, minutes: 360 });
    expect(rows[3]).toMatchObject({ autoClosed: true, bulkClosed: false });
  });

  test('is capped', () => {
    const many = Array.from({ length: 80 }, (_, i) => ({
      _id: `m${i}`,
      studentId: 's1',
      seatId: 'x1',
      inAt: new Date(2026, 4, 11, 0, i),
    }));
    expect(buildActivity({ visits: many, names, seatLabels: labels, now, limit: 50 })).toHaveLength(
      50
    );
  });
});
