import {
  expiringPlans,
  groupSalesByDay,
  hoursPerLearner,
  nextMonth,
  noShows,
  occupancy,
} from '../utils/visitReports.js';

const d = (iso) => new Date(iso);

describe('nextMonth', () => {
  test('rolls the year over', () => {
    expect(nextMonth('2026-05')).toBe('2026-06');
    expect(nextMonth('2026-12')).toBe('2027-01');
    expect(nextMonth('2026-01')).toBe('2026-02');
  });
});

describe('hoursPerLearner', () => {
  const from = d('2026-04-30T18:30:00Z'); // 1 May 00:00 IST
  const to = d('2026-05-31T18:30:00Z'); // 1 June 00:00 IST
  const now = d('2026-05-20T10:00:00Z');
  const visit = (studentId, inAt, outAt, extra = {}) => ({
    studentId,
    inAt: d(inAt),
    outAt: outAt ? d(outAt) : undefined,
    ...extra,
  });

  test('sums whole minutes per learner, longest first', () => {
    const rows = hoursPerLearner({
      visits: [
        visit('a', '2026-05-11T04:00:00Z', '2026-05-11T06:00:00Z'), // 120
        visit('a', '2026-05-12T04:00:00Z', '2026-05-12T05:30:00Z'), // 90
        visit('b', '2026-05-11T04:00:00Z', '2026-05-11T09:00:00Z'), // 300
      ],
      from,
      to,
      now,
    });
    expect(rows.map((r) => [r.studentId, r.minutes, r.visits])).toEqual([
      ['b', 300, 1],
      ['a', 210, 2],
    ]);
  });

  test('an open visit counts up to now', () => {
    const rows = hoursPerLearner({
      visits: [visit('a', '2026-05-20T08:00:00Z')],
      from,
      to,
      now,
    });
    expect(rows[0].minutes).toBe(120);
  });

  test('a visit belongs to the month it began in, on the centre’s clock', () => {
    const rows = hoursPerLearner({
      visits: [
        // 23:30 IST on 31 May: May.
        visit('a', '2026-05-31T18:00:00Z', '2026-05-31T18:20:00Z'),
        // 00:10 IST on 1 June: June, so out of this month.
        visit('a', '2026-05-31T18:40:00Z', '2026-05-31T19:00:00Z'),
        // Before the month.
        visit('a', '2026-04-30T18:00:00Z', '2026-04-30T18:20:00Z'),
      ],
      from,
      to,
      now,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ minutes: 20, visits: 1 });
  });

  test('counts auto-closed visits, and never goes negative', () => {
    const rows = hoursPerLearner({
      visits: [
        visit('a', '2026-05-11T04:00:00Z', '2026-05-11T05:00:00Z', { autoClosed: true }),
        visit('a', '2026-05-12T04:00:00Z', '2026-05-12T03:00:00Z'),
      ],
      from,
      to,
      now,
    });
    expect(rows[0]).toMatchObject({ minutes: 60, visits: 2, autoClosedVisits: 1 });
  });

  test('no visits gives an empty list', () => {
    expect(hoursPerLearner({ visits: [], from, to, now })).toEqual([]);
  });
});

describe('occupancy', () => {
  const seat = (id, extra = {}) => ({ _id: id, isActive: true, ...extra });
  const sections = [
    { _id: 'morning', name: 'Morning' },
    { _id: 'evening', name: 'Evening' },
  ];

  test('held, occupied, and the day-pass pool', () => {
    const result = occupancy({
      seats: [seat('s1'), seat('s2'), seat('s3'), seat('s4', { isActive: false })],
      allocations: [
        { seatId: 's1', studentId: 'm1', sectionId: 'morning' },
        { seatId: 's1', studentId: 'm2', sectionId: 'evening' },
        { seatId: 's2', studentId: 'm3', sectionId: 'evening' },
      ],
      openVisits: [
        { seatId: 's2', studentId: 'm3' },
        { seatId: 's3', studentId: 'walkin' },
      ],
      sections,
    });
    expect(result).toMatchObject({
      seatsActive: 3,
      held: 2, // s1 held in two shifts counts once
      occupiedNow: 2,
      poolSeats: 1, // s3
      poolFree: 0, // the walk-in is on it
    });
    expect(result.shifts).toEqual([
      { sectionId: 'morning', name: 'Morning', heldSeats: 1, checkedInNow: 0 },
      { sectionId: 'evening', name: 'Evening', heldSeats: 2, checkedInNow: 1 },
    ]);
  });

  test('an inactive seat is not counted even if it still has a hold', () => {
    const result = occupancy({
      seats: [seat('s1', { isActive: false })],
      allocations: [{ seatId: 's1', studentId: 'm1', sectionId: 'morning' }],
      openVisits: [],
      sections,
    });
    expect(result).toMatchObject({ seatsActive: 0, held: 0, poolSeats: 0 });
  });

  test('an empty centre is all zeros', () => {
    expect(occupancy({ seats: [], allocations: [], openVisits: [], sections: [] })).toEqual({
      seatsActive: 0,
      held: 0,
      occupiedNow: 0,
      poolSeats: 0,
      poolFree: 0,
      shifts: [],
    });
  });
});

describe('noShows', () => {
  const dayStart = d('2026-05-14T18:30:00Z');
  const dayEnd = d('2026-05-15T18:29:59.999Z');
  const plan = (studentId, status, from, to) => ({
    studentId,
    status,
    coversFrom: d(from),
    coversTo: d(to),
  });

  test('members with a paid plan covering the day and no visit that day', () => {
    const rows = noShows({
      members: [{ _id: 'came' }, { _id: 'absent' }, { _id: 'unpaid' }, { _id: 'noplan' }],
      assignments: [
        plan('came', 'paid', '2026-05-01T00:00:00Z', '2026-05-31T00:00:00Z'),
        plan('absent', 'paid', '2026-05-01T00:00:00Z', '2026-05-31T00:00:00Z'),
        plan('unpaid', 'unpaid', '2026-05-01T00:00:00Z', '2026-05-31T00:00:00Z'),
      ],
      visits: [{ studentId: 'came', inAt: d('2026-05-15T05:00:00Z') }],
      dayStart,
      dayEnd,
    });
    expect(rows.map((r) => r.studentId)).toEqual(['absent']);
  });

  test('a waived plan counts, a plan that ended or has not begun does not', () => {
    const rows = noShows({
      members: [{ _id: 'waived' }, { _id: 'ended' }, { _id: 'future' }],
      assignments: [
        plan('waived', 'waived', '2026-05-01T00:00:00Z', '2026-05-31T00:00:00Z'),
        plan('ended', 'paid', '2026-04-01T00:00:00Z', '2026-04-30T00:00:00Z'),
        plan('future', 'paid', '2026-06-01T00:00:00Z', '2026-06-30T00:00:00Z'),
      ],
      visits: [],
      dayStart,
      dayEnd,
    });
    expect(rows.map((r) => r.studentId)).toEqual(['waived']);
  });

  test('a visit on another day does not excuse the absence', () => {
    const rows = noShows({
      members: [{ _id: 'a' }],
      assignments: [plan('a', 'paid', '2026-05-01T00:00:00Z', '2026-05-31T00:00:00Z')],
      visits: [{ studentId: 'a', inAt: d('2026-05-14T05:00:00Z') }],
      dayStart,
      dayEnd,
    });
    expect(rows).toHaveLength(1);
  });

  test('reports when the covering plan ends, the latest of several', () => {
    const rows = noShows({
      members: [{ _id: 'a' }],
      assignments: [
        plan('a', 'paid', '2026-05-01T00:00:00Z', '2026-05-20T00:00:00Z'),
        plan('a', 'paid', '2026-05-10T00:00:00Z', '2026-05-31T00:00:00Z'),
      ],
      visits: [],
      dayStart,
      dayEnd,
    });
    expect(rows[0].coversTo.toISOString()).toBe('2026-05-31T00:00:00.000Z');
  });
});

describe('groupSalesByDay', () => {
  test('groups by the centre’s day, sums money, skips refunds, orders by day', () => {
    const rows = groupSalesByDay({
      timezone: 'Asia/Kolkata',
      payments: [
        // 23:30 IST on 18 May and 00:30 IST on 19 May are different days in IST.
        { amount: 150, paymentDate: d('2026-05-18T18:00:00Z') },
        { amount: 150, paymentDate: d('2026-05-18T05:00:00Z') },
        { amount: 142, paymentDate: d('2026-05-18T19:00:00Z') },
        { amount: 150, paymentDate: d('2026-05-17T05:00:00Z'), refunded: true },
      ],
    });
    expect(rows).toEqual([
      { day: '2026-05-18', count: 2, revenue: 300 },
      { day: '2026-05-19', count: 1, revenue: 142 },
    ]);
  });

  test('no payments gives no days', () => {
    expect(groupSalesByDay({ payments: [], timezone: 'Asia/Kolkata' })).toEqual([]);
  });
});

describe('expiringPlans', () => {
  const now = d('2026-05-20T10:00:00Z'); // 15:30 IST on 20 May
  const timezone = 'Asia/Kolkata';
  // coversTo is the last millisecond of the last covered day on the centre's clock.
  const endOf = (day) => new Date(Date.parse(`${day}T23:59:59.999+05:30`));
  const plan = (studentId, status, lastDay, extra = {}) => ({
    studentId,
    status,
    feeStructureId: 'f1',
    coversTo: endOf(lastDay),
    ...extra,
  });
  const run = (assignments, extra = {}) =>
    expiringPlans({ assignments, now, timezone, ...extra }).map((r) => [
      r.studentId,
      r.state,
      r.daysLeft,
    ]);

  test('lists plans ending within the window, lapsed ones first, with days left', () => {
    const rows = run([
      plan('soon', 'paid', '2026-05-22'),
      plan('today', 'waived', '2026-05-20'),
      plan('lapsed', 'paid', '2026-05-16'),
      plan('far', 'paid', '2026-06-20'),
    ]);
    expect(rows).toEqual([
      ['lapsed', 'lapsed', -4],
      ['today', 'expiring', 0],
      ['soon', 'expiring', 2],
    ]);
  });

  test('the window edges: days ahead is inclusive, a week back is inclusive', () => {
    expect(run([plan('a', 'paid', '2026-05-23')]).length).toBe(1); // +3
    expect(run([plan('a', 'paid', '2026-05-24')]).length).toBe(0); // +4
    expect(run([plan('a', 'paid', '2026-05-24')], { days: 5 }).length).toBe(1);
    expect(run([plan('a', 'paid', '2026-05-13')]).length).toBe(1); // -7
    expect(run([plan('a', 'paid', '2026-05-12')]).length).toBe(0); // -8
  });

  test('a member with a later plan has renewed and is not listed', () => {
    expect(run([plan('a', 'paid', '2026-05-21'), plan('a', 'paid', '2026-06-20')]).length).toBe(0);
  });

  test('a later unpaid renewal is a collection matter, not a second sale', () => {
    expect(run([plan('a', 'paid', '2026-05-21'), plan('a', 'unpaid', '2026-06-20')]).length).toBe(
      0
    );
    expect(run([plan('a', 'partial', '2026-05-21')]).length).toBe(0);
  });

  test('a renewal starts the day after an expiring plan, and today for a lapsed one', () => {
    const [lapsed, soon] = expiringPlans({
      assignments: [plan('lapsed', 'paid', '2026-05-16'), plan('soon', 'paid', '2026-05-22')],
      now,
      timezone,
    });
    expect(soon.renewFrom.toISOString()).toBe('2026-05-22T18:30:00.000Z'); // 23 May 00:00 IST
    expect(lapsed.renewFrom).toBeNull();
  });

  test('uses the centre’s calendar: 00:30 IST on the 21st is still the 21st', () => {
    const early = d('2026-05-20T19:00:00Z'); // 00:30 IST on 21 May
    const r = expiringPlans({
      assignments: [plan('a', 'paid', '2026-05-21')],
      now: early,
      timezone,
    });
    expect(r[0].daysLeft).toBe(0);
  });

  test('an assignment with no coverage (a school fee) is ignored', () => {
    expect(run([{ studentId: 'a', status: 'paid' }])).toEqual([]);
  });
});
